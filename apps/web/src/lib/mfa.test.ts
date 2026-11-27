import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

/**
 * Regressão do contrato de MFA entre web e API.
 *
 * Três defeitos que se somavam:
 * 1. a web mandava `{ code }` e o servidor valida `token` → `ValidationPipe`
 *    recusava com 400. Como só quem tem MFA ativo passa por `/auth/mfa/verify`,
 *    **ninguém com segundo fator conseguia entrar**;
 * 2. a web pedia o QR code em `?secret=`, levando o segredo TOTP para log de
 *    acesso, histórico e cache de proxy;
 * 3. `mfaDisable()` não enviava código nenhum, e desligar o segundo fator é
 *    exatamente o que um atacante com a sessão sequestrada faria.
 */

function mockFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [
    string,
    { method?: string; body?: string; headers: Record<string, string> },
  ];
  return { url, init, body: init.body ? JSON.parse(init.body) : undefined };
}

beforeEach(() => {
  vi.stubGlobal('document', { cookie: '' });
  // localStorage/store usado pelo cliente para o token de sessão
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs?.();
});

describe('MFA — contrato com a API', () => {
  it('envia `token` (não `code`) na verificação do segundo fator', async () => {
    const fetchMock = mockFetch(200, { token: 'jwt', user: { id: 'u-1' } });

    await api.mfaVerify({ token: '123456' }, 'temp-token');

    const { url, body } = call(fetchMock);
    expect(url).toContain('/auth/mfa/verify');
    expect(body).toEqual({ token: '123456' });
    expect(body).not.toHaveProperty('code');
  });

  it('pede o QR code sem mandar segredo na URL', async () => {
    const fetchMock = mockFetch(200, {
      qrCode: 'data:image/png;base64,x',
      otpauthUrl: 'otpauth://totp/x',
    });

    await api.mfaQrCode();

    const { url } = call(fetchMock);
    expect(url).toMatch(/\/auth\/mfa\/qr-code$/);
    expect(url).not.toContain('secret=');
  });

  it('ativa o MFA só com o código (o segredo fica no servidor)', async () => {
    const fetchMock = mockFetch(200, { mfaEnabled: true, user: { id: 'u-1' } });

    await api.mfaEnable({ token: '123456' });

    const { body } = call(fetchMock);
    expect(body).toEqual({ token: '123456' });
    expect(body).not.toHaveProperty('secret');
  });

  it('exige o código do autenticador para desligar o MFA', async () => {
    const fetchMock = mockFetch(200, { mfaEnabled: false, user: { id: 'u-1' } });

    await api.mfaDisable({ token: '654321' });

    const { url, init, body } = call(fetchMock);
    expect(url).toContain('/auth/mfa/disable');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ token: '654321' });
  });
});
