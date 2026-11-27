# Cifragem de campos sensíveis: alternativas avaliadas

Os campos `Consent.externalId` e `BankConnection.providerAccountId` ficam cifrados em repouso por
uma **Client Extension** do Prisma (`apps/api/src/prisma/sensitive-fields.extension.ts`), aplicada
no `PrismaModule`. O middleware global (`$use`) que fazia isso foi removido no Prisma 6.14.

Este documento registra as alternativas, o que cada uma custa e por que a escolhida foi a atual.
Serve para reavaliar a decisão quando o código crescer.

## Contexto: o que mudou

- `$use` foi depreciado no Prisma 4.16 e **removido no 6.14**; no Prisma 7 a única forma de
  interceptar queries é **Client Extension** (`$extends`).
- O projeto está em `@prisma/client@6.19.3`, então `$use` já não existe no runtime (o
  `prisma-client.d.ts` declarava a assinatura e mascarava isso no typecheck — foi por isso que o bug
  só apareceu na Vercel).
- Restrição prática: o CI/Vercel **só** roda `prisma generate`, nunca `migrate`. Por isso qualquer
  solução que dependa de mudança de schema precisa de SQL aplicado à mão no Supabase, e o
  `schema.prisma` fica dessincronizado do banco.

## Comparativo

| #   | Abordagem                                     | Onde a regra vive | Falha se alguém esquecer? | Serve para buscar/indexar o campo? | Custo agora |
| --- | --------------------------------------------- | ----------------- | ------------------------- | ---------------------------------- | ----------- |
| 1   | Explícito no serviço                          | call site         | Sim                       | Não                                | feito       |
| 2   | **Client Extension (`$extends`) — em uso**    | infraestrutura    | Não                       | Não (só cifra o que passa)         | feito       |
| 3   | Tipo "branded" + helpers                      | tipo + call site  | Sim, mas em compile time  | Não                                | baixo       |
| 4   | Cifra no banco (`pgcrypto`/`supabase_vault`)  | banco             | Não                       | Sim (com hash/índice)              | médio-alto  |
| 5   | Banco cofre separado (`supabase_vault`)       | banco + app       | Não                       | Não (só referência)                | alto        |
| 6   | Mascarar no DTO (só não devolver em claro)    | borda HTTP        | Sim                       | Não                                | muito baixo |
| 7   | Hash determinístico (busca) + cifra (leitura) | call site         | Sim                       | Sim                                | médio       |

## 1. Explícito no serviço (foi o paliativo após o bug)

`PrismaService.encryptSensitive` / `decryptSensitive`, chamados pelo controller que toca o campo.

- **A favor**: zero mágica, fácil de depurar, funciona em qualquer versão do Prisma, não depende de
  `prisma generate`. O teste unitário enxerga a chamada.
- **Contra**: a regra é fácil de esquecer num endpoint novo — e o modo de falha é silencioso (grava
  texto plano). Não ajuda em `where`, `orderBy` nem `select` parcial: se alguém fizer
  `select: { providerAccountId: true }` em outro lugar, recebe o valor cifrado sem aviso.
- **Quando dói**: a partir do momento em que houver mais de ~5 pontos tocando os campos sensíveis.

## 2. Client Extension — a substituta oficial do middleware

```ts
const base = new PrismaClient();

export const prisma = base.$extends({
  query: {
    consent: {
      async $allOperations({ args, query, operation }) {
        if (operation === 'create' || operation === 'update' || operation === 'upsert') {
          // cifra args.data.externalId
        }
        const result = await query(args);
        // decifra result.externalId
        return result;
      },
    },
  },
});
```

- **A favor**: é a substituição que o próprio Prisma indica; a regra volta para a infraestrutura e
  nenhum call site precisa lembrar. `$allOperations` cobre todas as operações do modelo. Como
  `$extends` devolve um cliente novo, dá para ter um cliente "cifrado" e outro "cru" no mesmo
  processo.
- **Contra**: `args` e o resultado são `any` no cliente gerado neste ambiente (o shim
  `prisma-client.d.ts` não tem os tipos), então a extensão seria escrita sem rede de segurança de
  tipos. A API de `$allOperations` muda entre versões menores do Prisma — precisa de teste de
  integração para não repetir o bug do `$use`. O PrismaService deixaria de "ser" um PrismaClient
  (passaria a embrulhar um cliente estendido), o que mexe nos 14 arquivos de teste que fazem
  `as unknown as PrismaService`.
- **Vale a pena quando**: o Prisma for atualizado para 7 (lá é obrigatório) ou quando os campos
  sensíveis passarem de dois.

## 3. Tipo "branded" (`EncryptedString`) + helpers

```ts
type EncryptedString = string & { readonly __encrypted: unique symbol };
```

O helper devolve `EncryptedString`; o campo do DTO aceita `string`, mas o repositório só aceita
`EncryptedString`. Esquecer a cifra vira **erro de compilação**, não bug em produção.

- **A favor**: barato, sem dependência de runtime, mantém o código explícito.
- **Contra**: exige que os tipos do Prisma sejam reais (hoje o client não é gerado no sandbox, então
  na prática só funciona com `prisma generate` rodando no CI).

## 4. Cifra no banco: `pgcrypto` / `supabase_vault`

O Postgres cifra sozinho:

```sql
-- extensão pgcrypto 1.3 já instalada
INSERT INTO consents (external_id)
VALUES (pgp_sym_encrypt('valor', current_setting('app.encryption_key')));
```

- **A favor**: a cifra vale para qualquer cliente (psql, seed, script de importação), não só o
  NestJS. Não há como "esquecer" no código.
- **Contra**: a chave passa a trafegar em cada query (`current_setting`) ou fica numa função
  `SECURITY DEFINER`; o `pg_stat_statements` já está ativo e registraria a instrução com parâmetros.
  Todo acesso precisa lembrar de `pgp_sym_decrypt`, e o Prisma passa a ver `bytea`, o que quebra
  `select`/`orderBy` tipados sem uma view.
- **Custo escondido**: mudar tipo de coluna + migração manual aplicada no Supabase (o CI não roda
  migrate).

## 5. Cofre separado (`supabase_vault` 0.3.1 — já disponível)

O valor sensível não mora na tabela de negócio: mora no vault, e a tabela guarda só um `vault_id`.

- **A favor**: é o padrão da indústria para segredo; rotação de chave fica no vault; um dump da
  tabela não vaza nada.
- **Contra**: uma consulta a mais por leitura, sem `join` tipado pelo Prisma, e uma tabela extra
  para manter. Overkill para dois campos que hoje nem são usados em busca.

## 6. Só mascarar no DTO

Não cifra nada: apenas não devolve o campo em claro na API.

- **A favor**: custo quase zero.
- **Contra**: não atende "cifrado em repouso" — um dump do banco vaza. Serve só como camada
  complementar (não mostrar o valor completo na listagem).

## 7. Hash determinístico + cifra

Guarda `hash = HMAC(pepper, valor)` (indexável, único) **e** `valor_cifrado`.

- **A favor**: única opção que permite `where`/`@@unique` no campo sensível — e note que o schema
  **já tem** `@@unique([provider, providerAccountId])`, hoje sobre o valor cifrado. Como o AES-GCM
  usa IV aleatório, o mesmo `providerAccountId` gera ciphertexts diferentes: **essa unique não
  protege nada** hoje. É um bug silencioso.
- **Contra**: duas colunas, migração manual, e o hash precisa de pepper versionado (mesma disciplina
  de rotação da chave).

## O que foi implementado (opção 2)

`sensitiveFieldsExtension()` é aplicada no `PrismaModule` sobre o cliente devolvido por
`PrismaService`, então **todo** ponto que recebe `PrismaService` por injeção já escreve cifrado e lê
em claro — inclusive fora dos controllers. A cifra/decifra fica em `applySensitiveFields`, testada
isoladamente.

Duas armadilhas encontradas ao validar em produção, ambas com teste de regressão:

1. **O nome do modelo chega em PascalCase.** O Prisma entrega `model: "Consent"`, não `"consent"` —
   comparar direto com a chave camelCase deixava a extensão ativa mas sem casar modelo nenhum, e os
   campos eram gravados em texto plano sem erro algum. `sensitiveFieldsFor` normaliza a comparação.
2. **`upsert` não traz os dados em `args.data`.** Os valores vêm em `args.create`/`args.update`,
   então a cifra percorre os três formatos (e as listas de `createMany`).

Validação em produção: gravou `enc:…` no banco e devolveu o valor em claro na API.

## Recomendação

- **Agora**: **corrigir o `@@unique`** de `BankConnection` — trocar por hash determinístico (7) na
  mesma migração que já vai mexer no schema para status/liquidação. Sem isso a unicidade de conexão
  bancária é ficção, porque o mesmo `providerAccountId` gera ciphertexts diferentes (IV aleatório).
- **Ao subir para Prisma 7**: a extensão continua valendo (`$extends` é o mecanismo oficial de lá);
  revisar apenas a assinatura de `$allOperations`.
- **Se aparecer requisito de auditoria/compliance**: 5 (vault) para o segredo e 4 (pgcrypto) para o
  restante.

## Nota sobre `ENCRYPTION_KEY`

A API exige **32 bytes em base64** (`openssl rand -base64 32`). O `.env.example` ainda mostra um
exemplo em hex de 64 caracteres — que decodifica para 48 bytes e derruba a inicialização. Ajustar
junto com o próximo commit de configuração.
