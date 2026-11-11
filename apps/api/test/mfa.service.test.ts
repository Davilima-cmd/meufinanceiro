import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MfaService } from '../src/mfa/mfa.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

describe('MfaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(makeService()).toBeDefined();
  });

  it('generateSecret should return a base32 secret and an otpauth URL', () => {
    const svc = makeService();
    const result = svc.generateSecret('davi@example.com');
    expect(typeof result.secret).toBe('string');
    expect(result.secret.length).toBeGreaterThan(0);
    expect(result.otpauthUrl).toContain('otpauth://totp');
  });

  it('verifyToken should validate a real TOTP token and reject wrong ones', () => {
    const svc = makeService();
    const generated = makeSecret();
    const token = speakeasy.totp({ secret: generated.base32, encoding: 'base32' });
    expect(svc.verifyToken(token, generated.base32)).toBe(true);
    expect(svc.verifyToken('000000', generated.base32)).toBe(false);
  });

  it('enableMFA should enable MFA when the token is valid', async () => {
    const svc = makeService();
    const generated = makeSecret();
    const token = speakeasy.totp({ secret: generated.base32, encoding: 'base32' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', email: 'a@b.com' });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1', mfaEnabled: true });

    const result = await svc.enableMFA('u-1', token, generated.base32);

    expect(result.mfaEnabled).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { totpSecret: `enc:${generated.base32}`, mfaEnabled: true },
      select: { id: true, email: true, mfaEnabled: true },
    });
  });

  it('enableMFA should throw BadRequestException when the token is invalid', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' });
    await expect(
      svc.enableMFA('u-1', '000000', 'SECRETBASE32===='),
    ).rejects.toThrow(BadRequestException);
  });

  it('enableMFA should throw NotFoundException when the user does not exist', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(
      svc.enableMFA('u-1', '000000', 'SECRETBASE32===='),
    ).rejects.toThrow(NotFoundException);
  });

  it('disableMFA should remove the secret and disable MFA', async () => {
    const svc = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' });
    prismaMock.user.update.mockResolvedValue({ id: 'u-1', mfaEnabled: false });

    const result = await svc.disableMFA('u-1');

    expect(result.mfaEnabled).toBe(false);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { totpSecret: null, mfaEnabled: false },
      select: { id: true, email: true, mfaEnabled: true },
    });
  });

  it('validateMFA should return true for a valid token against the stored secret', async () => {
    const svc = makeService();
    const generated = makeSecret();
    const token = speakeasy.totp({ secret: generated.base32, encoding: 'base32' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: true,
      totpSecret: `enc:${generated.base32}`,
    });
    expect(await svc.validateMFA('u-1', token)).toBe(true);
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
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      mfaEnabled: true,
      totpSecret: null,
    });
    expect(await svc.validateMFA('u-1', '000000')).toBe(false);
  });
});
