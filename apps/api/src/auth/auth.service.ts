import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  generateToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  generateTempToken(userId: string): string {
    return this.jwt.sign({ sub: userId }, { expiresIn: '5m' });
  }

  async register(dto: { email: string; name: string; password: string }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: await this.hashPassword(dto.password),
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return null;
    }

    const passwordMatches = await this.comparePassword(password, user.password);

    if (!passwordMatches) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Exclui a conta do usuário e todos os seus dados pessoais (LGPD — direito
   * à exclusão, art. 18).
   *
   * - Revoga os compartilhamentos de contas titularizados pelo usuário.
   * - Remove os compartilhamentos recebidos (o titular não existe mais).
   * - Exclui o usuário; todas as entidades com `onDelete: Cascade`
   *   (sessões, parcerias, contas, transações, categorias, orçamentos, metas,
   *   conexões, consentimentos, jobs) são excluídas no banco.
   * - Logs de auditoria são mantidos com `userId` nulificado (SetNull):
   *   evidência da ação sem dados pessoais.
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const deletedAt = new Date();

    // Revoga compartilhamentos de contas do titular antes da exclusão.
    await this.prisma.accountShare.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: deletedAt },
    });

    // Auditoria antes de remover o usuário: o cascade SetNull preserva o
    // registro sem vincular ao usuário excluído.
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETED',
        target: userId,
        metadata: { deletedAt: deletedAt.toISOString() },
      },
    });

    await this.prisma.user.delete({ where: { id: userId } });
  }
}
