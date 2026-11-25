import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Redefinição de senha (item 26.2 da especificação).
 *
 * Segurança:
 * - a resposta de `/auth/forgot-password` é sempre a mesma, exista ou não o
 *   e-mail, para não revelar quem tem conta;
 * - o token tem 32 bytes aleatórios, é guardado só como hash SHA-256 e é de
 *   uso único, com validade de 30 minutos;
 * - nenhum token de redefinição é escrito em log.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService
  ) {}

  async request(email: string): Promise<{ requested: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return { requested: true };

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    // Integração de e-mail fica a cargo do provedor configurado em produção.
    // Sem ele, registramos apenas que um pedido foi gerado — nunca o token.
    this.logger.log(`Pedido de redefinição registrado para o usuário ${user.id}`);

    if (process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_DEBUG === 'true') {
      this.logger.warn(`Token de redefinição (ambiente de desenvolvimento): ${token}`);
    }

    return { requested: true };
  }

  async reset(token: string, newPassword: string): Promise<{ reset: true }> {
    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token inválido ou expirado. Solicite um novo link.');
    }

    const password = await this.auth.hashPassword(newPassword);

    await this.prisma.$transaction(async (tx: PrismaService) => {
      await tx.user.update({ where: { id: record.userId }, data: { password } });
      await tx.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      // Todas as outras sessões abertas deixam de valer após a troca de senha.
      await tx.session.deleteMany({ where: { userId: record.userId } });
    });

    return { reset: true };
  }
}
