# Arquitetura do projeto

## Implementado na Fase 0

```text
apps/
  web/       Next.js + React + TypeScript
  mobile/    React Native + Expo + TypeScript
  api/       NestJS + TypeScript
packages/
  shared-types/  contratos de compartilhamento e tipos financeiros
  validation/    tipos de resultado de validação
  design-tokens/ medidas básicas da interface
```

As aplicações web e mobile ainda não consomem a API. O único endpoint disponível é
`GET /api/health`, usado para confirmar que a API iniciou.

## Arquitetura prevista pela especificação

- Web hospedada na Vercel.
- API hospedada no Render.
- PostgreSQL gerenciado pelo Supabase, acessado via Prisma.
- Open Finance isolado em um adaptador, começando por sandbox.
- Eventos de webhook e reconciliação armazenados/processados no PostgreSQL, sem Redis ou BullMQ.
- Android distribuído como APK privado via EAS Build.

Esses serviços e fluxos são decisões documentadas, não integrações já implantadas. A implementação
deve respeitar as fases em `docs/especificacao_final.md`.

## Contratos compartilhados

- `packages/shared-types/src/index.ts`: níveis de compartilhamento `BALANCE_ONLY` e `FULL`, valor
  monetário em centavos (`bigint`) e data ISO UTC.
- `packages/validation/src/index.ts`: formato discriminado para resultado e problemas de validação.
- `packages/design-tokens/src/index.ts`: escala de espaçamento e raios de borda.

## Fluxo de leitura sugerido

1. `docs/especificacao_final.md` para requisitos e decisões.
2. `apps/web/src/app/page.tsx` para a entrada web.
3. `apps/mobile/App.tsx` para a entrada Android.
4. `apps/api/src/main.ts` e `apps/api/src/app.module.ts` para a inicialização da API.
5. Os pacotes em `packages/` para contratos compartilhados.
