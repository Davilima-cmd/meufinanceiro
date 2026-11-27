import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setCsrfToken } from './api';

/**
 * Regressão do 403 "token CSRF ausente ou inválido" ao criar conta.
 *
 * Em produção a web roda num domínio e a API em outro. O cookie `mf_csrf` é
 * gravado no domínio da API, então `document.cookie` da página **não** o
 * enxerga: o cliente precisa usar o valor que a API devolve no corpo de
 * `/auth/login`, `/auth/mfa/verify` e `/auth/status`. Antes disso o header nunca
 * era enviado e toda escrita autenticada por cookie caía em 403.
 */
const CSRF = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function mockFetch(status = 200, body: unknown = {}) {
  // O cliente lê `res.text()` e faz o parse do JSON (204/corpo vazio não têm
  // JSON), então o mock precisa expor os dois métodos.
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, { headers: Record<string, string> }];
  return init.headers;
}

beforeEach(() => {
  // Nenhum cookie legível: é o cenário real (cookie pertence ao domínio da API).
  vi.stubGlobal('document', { cookie: '' });
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CSRF entre domínios no cliente da web', () => {
  it('guarda o csrfToken do login e o envia na próxima escrita', async () => {
    const fetchMock = mockFetch(200, {
      user: { id: 'u1', name: 'Davi', email: 'd@x.com' },
      csrfToken: CSRF,
    });

    // 1) login devolve o valor no corpo
    await api.login({ email: 'd@x.com', password: 'senha1234' });
    // 2) qualquer escrita seguinte (criar conta) deve carregar o header
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'acc-1' }),
      text: async () => JSON.stringify({ id: 'acc-1' }),
    } as never);

    await api.createAccount({ name: 'Conta corrente', type: 'checking' });

    expect(headersOf(fetchMock, 1)['X-CSRF-Token']).toBe(CSRF);
  });

  it('recupera o CSRF em GET /auth/status (recarregar a página não quebra a escrita)', async () => {
    const fetchMock = mockFetch(200, {
      authenticated: true,
      user: { id: 'u1', name: 'Davi', email: 'd@x.com' },
      sessionId: 'sid-1',
      sessions: 1,
      csrfToken: CSRF,
    });

    await api.authStatus();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as never);
    await api.setShareLevel('acc-1', 'FULL');

    expect(headersOf(fetchMock, 1)['X-CSRF-Token']).toBe(CSRF);
  });

  it('não envia o header CSRF em leitura', async () => {
    setCsrfToken(CSRF);
    const fetchMock = mockFetch(200, []);
    await api.getAccounts();
    expect(headersOf(fetchMock)['X-CSRF-Token']).toBeUndefined();
  });

  it('sair da conta descarta o valor em memória', async () => {
    const fetchMock = mockFetch(200, { revoked: true });
    setCsrfToken(CSRF);
    api.clearToken();
    await api.createAccount({ name: 'X', type: 'checking' });
    expect(headersOf(fetchMock)['X-CSRF-Token']).toBeUndefined();
  });
});
