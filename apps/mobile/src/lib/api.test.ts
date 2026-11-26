import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';

/**
 * Cliente da API no mobile.
 *
 * Esta camada é a diferença entre um protótipo com números fixos e um app que
 * mostra os dados reais. O que precisa estar certo: Bearer token, baseUrl sem
 * barra dupla, erro com mensagem legível e 401 derrubando a sessão.
 */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function client(fetchImpl: typeof fetch, onUnauthorized?: () => void) {
  return new ApiClient({ baseUrl: 'https://api.test/api/', fetchImpl, onUnauthorized });
}

describe('ApiClient', () => {
  it('faz login e guarda o token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ token: 'jwt-1', user: { id: 'u1', name: 'Davi', email: 'd@x.com' } })
    );

    const api = client(fetchImpl as unknown as typeof fetch);
    await api.login('  DAVI@X.com ', 'senha123');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // Barra no fim do baseUrl não pode virar barra dupla.
    expect(url).toBe('https://api.test/api/auth/login');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'davi@x.com',
      password: 'senha123',
    });
    expect(api.getToken()).toBe('jwt-1');
  });

  it('manda o token nas requisições seguintes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const api = client(fetchImpl as unknown as typeof fetch);
    api.setToken('jwt-1');

    await api.fetchSnapshot();

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
  });

  it('monta o snapshot com contas, lançamentos, categorias e metas', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/accounts')) return jsonResponse([{ id: 'acc-1' }]);
      if (url.endsWith('/transactions')) return jsonResponse([{ id: 'tx-1' }]);
      if (url.endsWith('/categories')) return jsonResponse([{ id: 'cat-1' }]);
      return jsonResponse([{ id: 'goal-1', name: 'Viagem', targetCents: '1', currentCents: '0' }]);
    });

    const snapshot = await client(fetchImpl as unknown as typeof fetch).fetchSnapshot();

    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.categories).toHaveLength(1);
    expect(snapshot.goals).toHaveLength(1);
  });

  it('metas fora do ar não derrubam o snapshot', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/financial-goals') ? jsonResponse({ message: 'erro' }, 500) : jsonResponse([])
    );

    const snapshot = await client(fetchImpl as unknown as typeof fetch).fetchSnapshot();

    expect(snapshot.goals).toEqual([]);
  });

  it('lança erro com a mensagem do servidor', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Credenciais inválidas' }, 400));

    await expect(
      client(fetchImpl as unknown as typeof fetch).login('a@b.com', 'x')
    ).rejects.toMatchObject({ message: 'Credenciais inválidas', status: 400 });
  });

  it('401 avisa a aplicação e limpa a sessão', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Sessão encerrada' }, 401));

    const api = client(fetchImpl as unknown as typeof fetch, onUnauthorized);
    api.setToken('velho');

    await expect(api.status()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('falha de rede vira mensagem clara', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });

    await expect(client(fetchImpl as unknown as typeof fetch).status()).rejects.toMatchObject({
      message: 'Sem conexão com o servidor.',
    });
  });

  it('logout é melhor esforço: token some mesmo se o servidor falhar', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'erro' }, 500));
    const api = client(fetchImpl as unknown as typeof fetch);
    api.setToken('jwt-1');

    await expect(api.logout()).resolves.toBeUndefined();
    expect(api.getToken()).toBeNull();
  });

  it('liquida lançamento pendente via PATCH', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'tx-1', status: 'paid' }));

    await client(fetchImpl as unknown as typeof fetch).settleTransaction('tx-1', '2026-11-25');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/transactions/tx-1/settle');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ paidAt: '2026-11-25' });
  });
});
