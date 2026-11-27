import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

/** Nome exibido no app autenticador. */
const MFA_ISSUER = 'MeuFinanceiro';

/** `otpauth://` do segredo — formato exigido pelos apps autenticadores. */
function buildOtpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(email);
  const issuer = encodeURIComponent(MFA_ISSUER);
  return `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}`;
}

/**
 * Serviço de MFA (TOTP).
 *
 * O segredo TOTP é armazenado cifrado (AES-256-GCM) no campo
 * `User.totpSecret` e só é habilitado após o usuário confirmar um token válido.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService
  ) {}

  /** E-mail do usuário, usado para rotular o segredo no app autenticador. */
  async profileForMfa(userId: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  /**
   * Gera um segredo base32 e a URL otpauth (Google Authenticator etc.).
   *
   * O segredo é guardado como **pendente** (cifrado) no usuário e devolvido uma
   * única vez para o app autenticador. O `enable` usa o pendente do servidor,
   * não o que o cliente mandar: assim ninguém consegue ativar MFA com um
   * segredo que só o atacante conhece.
   */
  async generateSecret(userId: string, email: string) {
    const generated = speakeasy.generateSecret({
      length: 32,
      name: email,
      issuer: MFA_ISSUER,
      otpauth_url: true,
    }) as speakeasy.GeneratedSecretWithOtpAuthUrl;

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpPendingSecret: this.encryption.encrypt(generated.base32) },
    });

    return {
      secret: generated.base32,
      otpauthUrl: buildOtpauthUrl(email, generated.base32),
    };
  }

  /**
   * URL otpauth do segredo pendente, para desenhar o QR code.
   *
   * Montada no servidor a partir do segredo guardado — o cliente não informa
   * segredo nenhum.
   */
  async pendingOtpauthUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, totpPendingSecret: true },
    });
    if (!user?.totpPendingSecret) return null;
    const secret = this.encryption.decrypt(user.totpPendingSecret);
    if (!secret) return null;
    return buildOtpauthUrl(user.email, secret);
  }

  /** Segredo pendente em claro, ou `null` se ninguém pediu um ainda. */
  async pendingSecret(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpPendingSecret: true },
    });
    if (!user?.totpPendingSecret) return null;
    return this.encryption.decrypt(user.totpPendingSecret);
  }

  /** Valida um token TOTP contra um segredo base32. */
  verifyToken(token: string, secret: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1, // tolera 1 intervalo de 30s de desvio de relógio
    });
  }

  /**
   * Habilita MFA.
   *
   * O segredo **nunca** é aceito do cliente: ele nasce no servidor
   * (`GET /auth/mfa/secret`) e fica pendente na sessão até o usuário provar que
   * o app autenticador foi configurado. Antes o corpo da requisição trazia o
   * `secret`, então qualquer sessão autenticada podia gravar um segredo
   * próprio (que o atacante conhece) e passar a gerar códigos válidos.
   */
  async enableMFA(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, totpPendingSecret: true },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.mfaEnabled) {
      throw new ConflictException('O segundo fator já está ativo nesta conta.');
    }

    const pending = user.totpPendingSecret ? this.encryption.decrypt(user.totpPendingSecret) : null;
    if (!pending) {
      throw new BadRequestException(
        'Nenhum segredo pendente. Recomece a configuração em GET /auth/mfa/secret.'
      );
    }

    if (!this.verifyToken(token, pending)) {
      throw new BadRequestException('Token TOTP inválido');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: this.encryption.encrypt(pending),
        totpPendingSecret: null,
        mfaEnabled: true,
      },
      select: { id: true, email: true, mfaEnabled: true },
    });
  }

  /**
   * Desabilita MFA e remove o segredo armazenado.
   *
   * Exige um código TOTP válido do **segredo ativo**: desligar o segundo fator
   * é justamente o que um atacante com a sessão sequestrada faria para se
   * livrar da proteção. Com a checagem, só quem tem o autenticador consegue.
   */
  async disableMFA(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (!user.mfaEnabled || !user.totpSecret) {
      throw new BadRequestException('O segundo fator não está ativo nesta conta.');
    }

    const secret = this.encryption.decrypt(user.totpSecret);
    if (!secret || !this.verifyToken(token, secret)) {
      throw new BadRequestException('Token TOTP inválido');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpPendingSecret: null,
        mfaEnabled: false,
      },
      select: { id: true, email: true, mfaEnabled: true },
    });
  }

  /** Valida um token TOTP contra o segredo armazenado do usuário (login/step-up). */
  async validateMFA(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaEnabled || !user.totpSecret) {
      return false;
    }

    const secret = this.encryption.decrypt(user.totpSecret);
    if (!secret) {
      return false;
    }

    return this.verifyToken(token, secret);
  }
}
