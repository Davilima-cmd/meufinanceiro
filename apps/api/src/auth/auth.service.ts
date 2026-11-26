import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    // argon2id com 64 MiB de memoria: custo alto o suficiente contra
    // forca bruta sem estourar o memoria do plano gratuito da Azure.
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Confere a senha atual do usuário (reautenticação para ação sensível).
   *
   * Resposta genérica de propósito: não diz se o usuário existe ou se a senha
   * está errada por outro motivo.
   */
  async assertPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    const matches = user ? await this.comparePassword(password, user.password) : false;
    if (!matches) {
      throw new UnauthorizedException('Senha incorreta.');
    }
  }

  generateTempToken(userId: string): string {
    return this.jwt.sign({ sub: userId, scope: 'mfa_pending' }, { expiresIn: '5m' });
  }

  /** Dados públicos do usuário (sem senha/segredo de MFA). */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async register(dto: { email: string; name: string; password: string }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      // Enumeração de contas: o 409 confirma que o e-mail existe. Fechar isso
      // exige cadastro assíncrono (responde 201 e manda e-mail de confirmação),
      // o que muda o fluxo de entrada — decisão de produto registrada em
      // docs/seguranca.md. Enquanto for 409, o limite de 5/min por IP em
      // `POST /auth/register` é o que impede varredura em massa.
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
