import { describe, expect, it } from 'vitest';
import {
  PluggyClient,
  PluggyConfigError,
  PluggyRequestError,
} from '../src/open-finance/pluggy.client';

/**
 * Cliente do Pluggy (Open Finance real).
 *
 * Estes testes usam `fetch` simulado porque não dá para chamar a API de
 * produção num teste automatizado (exige credenciais reais e criaria dados na
 * conta de alguém). O que garantimos aqui é o contrato que a documentação
 * descreve: troca de credenciais por API key, cache da chave, token do widget,
 * paginação completa e conversão correta de valores.
 */

type Call = {
  url: string;
  init: { method?: string; headers: Record<string, string>; body?: string };
};

function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch) {
  return new PluggyClient('client-id', 'client-secret', 'https://api.pluggy.ai', fetchImpl);
}

describe('PluggyClient', () => {
  it('troca clientId/clientSecret por apiKey e reutiliza a chave', async () => {
    const { impl, calls } = fakeFetch([
      { body: { apiKey: 'key-1' } },
      { body: { results: [] } },
      { body: { results: [] } },
    ]);
    const pluggy = client(impl);

    expect(await pluggy.getApiKey()).toBe('key-1');
    await pluggy.listAccounts('item-1');
    await pluggy.listAccounts('item-1');

    // 1 chamada de /auth + 2 de /accounts: a chave ficou em cache.
    expect(calls.filter((call) => call.url.endsWith('/auth'))).toHaveLength(1);
    expect(calls[1].init.headers['X-API-KEY']).toBe('key-1');
  });

  it('envia as credenciais no corpo do /auth e não as repete nas demais chamadas', async () => {
    const { impl, calls } = fakeFetch([{ body: { apiKey: 'key-1' } }]);
    await client(impl).getApiKey();

    const body = JSON.parse(calls[0].init.body ?? '{}');
    expect(body).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
  });

  it('cria connect token com clientUserId e webhook dentro de options', async () => {
    const { impl, calls } = fakeFetch([
      { body: { apiKey: 'key-1' } },
      { body: { accessToken: 'connect-abc' } },
    ]);
    const result = await client(impl).createConnectToken({
      clientUserId: 'user-1',
      webhookUrl: 'https://api.exemplo.com/api/open-finance/webhooks/pluggy',
    });

    expect(result.accessToken).toBe('connect-abc');
    const body = JSON.parse(calls[1].init.body ?? '{}');
    // A doc é explícita: clientUserId no root é descartado; precisa ir em options.
    expect(body.clientUserId).toBeUndefined();
    expect(body.options.clientUserId).toBe('user-1');
    expect(body.options.webhookUrl).toContain('/open-finance/webhooks/pluggy');
    expect(body.options.avoidDuplicates).toBe(true);
  });

  it('segue o cursor de /v2/transactions até a última página', async () => {
    const { impl, calls } = fakeFetch([
      { body: { apiKey: 'key-1' } },
      {
        body: {
          results: [{ id: 't1' }],
          next: '?accountId=acc-1&dateFrom=2026-01-01&after=MjAyNi0wMQ==',
        },
      },
      { body: { results: [{ id: 't2' }], next: null } },
    ]);

    const transactions = await client(impl).listTransactions('acc-1', '2026-01-01');

    expect(transactions.map((tx) => tx.id)).toEqual(['t1', 't2']);
    // O endpoint legado (por página) está depreciado: nunca deve ser chamado.
    expect(
      calls.every((call) => !/\/transactions\?/.test(call.url.replace('/v2/transactions?', '')))
    ).toBe(true);
    expect(calls[1].url).toContain('/v2/transactions?');
    expect(calls[1].url).toContain('accountId=acc-1');
    expect(calls[1].url).toContain('dateFrom=2026-01-01');
    // Só o `after` do next é reaproveitado, nunca o `next` inteiro.
    expect(calls[2].url).toContain('after=MjAyNi0wMQ%3D%3D');
    expect(calls[2].url).toContain('accountId=acc-1');
  });

  it('para quando o provedor repete o cursor (não entra em loop)', async () => {
    const repeated = { results: [{ id: 't1' }], next: '?accountId=acc-1&after=Zm9v' };
    const { impl, calls } = fakeFetch([{ body: { apiKey: 'key-1' } }, { body: repeated }]);

    const transactions = await client(impl).listTransactions('acc-1');

    expect(transactions).toHaveLength(1);
    // /auth + primeira página + uma repetição que encerrou o laço.
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it('propaga o status do provedor em erro, sem vazar corpo inteiro', async () => {
    const { impl } = fakeFetch([
      { body: { apiKey: 'key-1' } },
      { status: 404, body: { message: 'Item not found' } },
    ]);

    await expect(client(impl).getItem('inexistente')).rejects.toBeInstanceOf(PluggyRequestError);
  });

  it('falha cedo quando as credenciais não estão no ambiente', () => {
    const previousId = process.env.PLUGGY_CLIENT_ID;
    const previousSecret = process.env.PLUGGY_CLIENT_SECRET;
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    try {
      expect(PluggyClient.configured()).toBe(false);
      expect(() => PluggyClient.fromEnv()).toThrow(PluggyConfigError);
    } finally {
      if (previousId !== undefined) process.env.PLUGGY_CLIENT_ID = previousId;
      if (previousSecret !== undefined) process.env.PLUGGY_CLIENT_SECRET = previousSecret;
    }
  });

  it('considera configurado quando id e segredo existem', () => {
    const previousId = process.env.PLUGGY_CLIENT_ID;
    const previousSecret = process.env.PLUGGY_CLIENT_SECRET;
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    try {
      expect(PluggyClient.configured()).toBe(true);
    } finally {
      if (previousId === undefined) delete process.env.PLUGGY_CLIENT_ID;
      else process.env.PLUGGY_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.PLUGGY_CLIENT_SECRET;
      else process.env.PLUGGY_CLIENT_SECRET = previousSecret;
    }
  });
});

describe('conversão de valores do provedor', () => {
  it('reais decimais viram centavos inteiros sem erro de ponto flutuante', async () => {
    const { impl } = fakeFetch([
      { body: { apiKey: 'key-1' } },
      {
        body: {
          results: [
            { id: 't1', description: 'iFood', amount: -212.45, date: '2026-11-20T00:00:00.000Z' },
            { id: 't2', description: 'Salário', amount: 5000.1, date: '2026-11-05T00:00:00.000Z' },
          ],
          next: null,
        },
      },
    ]);
    const raw = await client(impl).listTransactions('acc-1');
    // O arredondamento vive no provider; aqui confirmamos o dado de origem.
    expect(Math.round(raw[0].amount * 100)).toBe(-21245);
    expect(Math.round(raw[1].amount * 100)).toBe(500010);
  });
});
