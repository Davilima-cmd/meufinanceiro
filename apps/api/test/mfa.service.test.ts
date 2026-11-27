import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MfaService } from '../src/mfa/mfa.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as speakeasy from 'speakeasy';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as any;

const encryptionMock = {
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => String(s).replace(/^enc:/, '')),
  isEncrypted: vi.fn((s: string) => String(s).startsWith('enc:')),
} as any;

function makeService() {
  return new MfaService(prismaMock, encryptionMock);
}

function makeSecret() {
  return speakeasy.generateSecret({
    length: 32,
    name: 'davi@example.com',
    issuer: 'MeuFinanceiro',
    otpauth_url: true,
  }) as { base32: string; otpauth_url: string };
}

function tokenFor(base32: string) {
  return speakeasy.totp({ secret: base32, encoding: 'base32' });
}

describe('MfaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({ id: 'u-1' });
  });

  it('should be defined', () => {
    expect(makeService()).toBeDefined();
  });

  it('generateSecret guarda o segredo como pendente e devolve só uma vez', async () => {
    const svc = makeService();
    const result = await svc.generateSecret('u-1', 'davi@example.com');

    expect(typeof result.secret).toBe('string');
    expect(result.secret.length).toBeGreaterThan(0);
    expect(result.otpauthUrl).toContain('otpauth://totp');

    // O segredo que o cliente recebe é exatamente o que ficou guardado (cifrado)
    // como pendente: o `enable` vai validar contra ele, não contra o corpo.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { totpPendingSecret: `enc:${result.secret}` },
    });
  });

  it('verifyToken should validate a real TOTP token and reject wrong ones', () => {
    const svc = makeService();
    const generated = makeSecret();
    expect(svc.verifyToken(tokenFor(generated.base32), generated.base32)).toBe(true);
    expect(svc.verifyToken('000000', generated.base32)).toBe(false);
  });

  it('pendingOtpauthUrl usa o segredo pendente do servidor', async () => {
    const svc = makeService();
    const generated = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'davi@example.com',
      totpPendingSecret: `enc:${generated.base32}`,
    });

    const url = await svc.pendingOtpauthUrl('u-1');

    expect(url).toContain('otpauth://totp');
    expect(url).toContain(generated.base32);
  });

  it('pendingOtpauthUrl devolve null sem segredo pendente', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@b.com', totpPendingSecret: null });
    expect(await svc.pendingOtpauthUrl('u-1')).toBeNull();
  });

  it('enableMFA ativa usando o segredo pendente, não um vindo do cliente', async () => {
    const svc = makeService();
    const generated = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      totpPendingSecret: `enc:${generated.base32}`,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1', mfaEnabled: true });

    const result = await svc.enableMFA('u-1', tokenFor(generated.base32));

    expect(result.mfaEnabled).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: {
        totpSecret: `enc:${generated.base32}`,
        totpPendingSecret: null,
        mfaEnabled: true,
      },
      select: { id: true, email: true, mfaEnabled: true },
    });
  });

  it('enableMFA recusa código válido de outro segredo (cliente não escolhe segredo)', async () => {
    const svc = makeService();
    const pending = makeSecret();
    const attacker = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      totpPendingSecret: `enc:${pending.base32}`,
    });

    await expect(svc.enableMFA('u-1', tokenFor(attacker.base32))).rejects.toThrow(
      BadRequestException
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('enableMFA exige segredo pendente', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ mfaEnabled: false, totpPendingSecret: null });
    await expect(svc.enableMFA('u-1', '000000')).rejects.toThrow(BadRequestException);
  });

  it('enableMFA recusa reativar quando o MFA já está ativo', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      totpPendingSecret: null,
    });
    await expect(svc.enableMFA('u-1', '000000')).rejects.toThrow(ConflictException);
  });

  it('enableMFA lança NotFound quando o usuário não existe', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(svc.enableMFA('u-1', '000000')).rejects.toThrow(NotFoundException);
  });

  it('disableMFA desliga só com código válido do segredo ativo', async () => {
    const svc = makeService();
    const generated = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: true,
      totpSecret: `enc:${generated.base32}`,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1', mfaEnabled: false });

    const result = await svc.disableMFA('u-1', tokenFor(generated.base32));

    expect(result.mfaEnabled).toBe(false);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { totpSecret: null, totpPendingSecret: null, mfaEnabled: false },
      select: { id: true, email: true, mfaEnabled: true },
    });
  });

  it('disableMFA recusa código inválido (não deixa desligar sem o autenticador)', async () => {
    const svc = makeService();
    const generated = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: true,
      totpSecret: `enc:${generated.base32}`,
    });

    await expect(svc.disableMFA('u-1', '000000')).rejects.toThrow(BadRequestException);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('disableMFA recusa quando o MFA não está ativo', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: false,
      totpSecret: null,
    });
    await expect(svc.disableMFA('u-1', '123456')).rejects.toThrow(BadRequestException);
  });

  it('validateMFA should return true for a valid token against the stored secret', async () => {
    const svc = makeService();
    const generated = makeSecret();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: true,
      totpSecret: `enc:${generated.base32}`,
    });
    expect(await svc.validateMFA('u-1', tokenFor(generated.base32))).toBe(true);
  });

  it('validateMFA should return false when MFA is disabled', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: false,
      totpSecret: null,
    });
    expect(await svc.validateMFA('u-1', '000000')).toBe(false);
  });

  it('validateMFA should return false when there is no stored secret', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', mfaEnabled: true, totpSecret: null });
    expect(await svc.validateMFA('u-1', '000000')).toBe(false);
  });
});
