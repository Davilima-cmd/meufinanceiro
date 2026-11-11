import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

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
    private readonly encryption: EncryptionService,
  ) {}

  /** Gera um segredo base32 e a URL otpauth (Google Authenticator etc.). */
  generateSecret(email: string) {
    const generated = speakeasy.generateSecret({
      length: 32,
      name: email,
      issuer: 'MeuFinanceiro',
      otpauth_url: true,
    }) as speakeasy.GeneratedSecretWithOtpAuthUrl;
    return {
      secret: generated.base32,
      otpauthUrl: generated.otpauth_url,
    };
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

  /** Habilita MFA para o usuário após confirmar o token contra o segredo informado. */
  async enableMFA(userId: string, token: string, secret: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!this.verifyToken(token, secret)) {
      throw new BadRequestException('Token TOTP inválido');
    }

    const encryptedSecret = this.encryption.encrypt(secret);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: encryptedSecret,
        mfaEnabled: true,
      },
      select: { id: true, email: true, mfaEnabled: true },
    });
  }

  /** Desabilita MFA e remove o segredo armazenado. */
  async disableMFA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
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
