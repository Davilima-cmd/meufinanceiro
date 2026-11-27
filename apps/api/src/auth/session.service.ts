import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sessões revogáveis.
 *
 * O JWT é *stateless*: até expirar, ele vale em qualquer lugar. Isso é prático,
 * mas significa que "sair" no navegador não invalida nada — quem tiver o token
 * copiado continua entrando, e trocar a senha não derruba sessões antigas.
 *
 * Aqui cada login grava uma linha em `sessions` e o token carrega o id dela
 * (`sid`). A validação do JWT checa a sessão: revogada, expirada ou de outro
 * usuário → `401`. O token em si nunca é guardado — só um SHA-256 dele, igual
 * ao que já é feito em `password_resets`.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  /** Cria a sessão e devolve o JWT já com `sid`. */
  async create(userId: string): Promise<{ token: string; sessionId: string }> {
    const sessionId = randomUUID();
    const token = this.jwt.sign(
      { sub: userId, scope: 'full', sid: sessionId },
      { jwtid: randomBytes(16).toString('hex') }
    );
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    const expiresAt = new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000);

    await this.prisma.session.create({
      data: { id: sessionId, userId, tokenHash: hashToken(token), expiresAt },
    });

    return { token, sessionId };
  }

  /** Verifica se a sessão do token ainda existe, é do usuário e não expirou. */
  async assertActive(sessionId: string | undefined, userId: string | undefined): Promise<void> {
    if (!sessionId || !userId) {
      throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.userId !== userId || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }
  }

  /** Revoga uma sessão específica (logout). Idempotente. */
  async revoke(sessionId: string, userId: string): Promise<{ revoked: boolean }> {
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return { revoked: true };
  }

  /** Revoga todas as sessões do usuário (troca de senha, MFA, "sair de tudo"). */
  async revokeAll(userId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({ where: { userId } });
    return result.count;
  }

  /** Sessões abertas do usuário, sem expor o token. */
  async list(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/** O token inteiro é sensível: guardamos só o digest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
