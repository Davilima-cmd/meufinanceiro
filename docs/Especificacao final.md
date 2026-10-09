# Especificação Final — Meu Financeiro

> Versão consolidada. Substitui a especificação inicial onde houver conflito.
> Repositório: https://github.com/Davilima-cmd/meufinanceiro.git (privado, vazio no início)

## 1. Objetivo

Aplicativo financeiro para **duas pessoas (um casal)** acompanharem despesas, receitas, investimentos e metas, com consolidação de contas bancárias em um só lugar.

Duas interfaces, um único backend:
- **Android** (distribuição privada via APK; Play Store no futuro).
- **Web** responsiva.

**Versão 1 é somente consulta e organização.** Sem transferências, pagamentos ou movimentação real de dinheiro.

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Modelo de uso | Cada pessoa tem sua conta de usuário e conecta **as próprias** contas. Depois, cada uma escolhe quais contas **compartilhar** com a outra. |
| Privacidade padrão | Toda conta é **privada** até o dono compartilhar. Compartilhamento é revogável a qualquer momento. |
| Atualização de dados | **Por evento** (webhook a cada transação), **sem polling a cada X horas**. |
| Rede de segurança | Reconciliação **diária** + botão "Sincronizar agora". |
| Redis / BullMQ | **Não usar.** Fila de eventos em tabela do PostgreSQL. Reavaliar só se houver gargalo comprovado. |
| Android | APK privado via Expo (EAS Build). Play Store fica para o futuro. |
| Dinheiro | **Centavos inteiros** (`BigInt`) no banco e na API. Formatação só na interface. |
| Fuso horário | Armazenar em **UTC**. Exibir em `America/Bahia` (UTC-3). |
| Nuvem | Tudo na nuvem: repositório, banco e servidores. |

## 3. Stack

| Camada | Tecnologia | Hospedagem |
|---|---|---|
| Web | Next.js + React + TypeScript | Vercel |
| Android | React Native + Expo + TypeScript | APK privado (EAS Build) |
| API | NestJS + TypeScript | Render |
| Banco | PostgreSQL | Supabase (somente como Postgres gerenciado) |
| ORM / migrações | Prisma | — |
| Monorepo | pnpm workspaces + Turborepo | — |
| Repositório | GitHub (privado) | — |
| CI | GitHub Actions | — |
| Testes | Vitest ou Jest (lógica), Playwright (web), Jest + React Native Testing Library (mobile) | — |

**Regras da stack:**
- O Supabase é usado **apenas como PostgreSQL**. Não usar Supabase Auth nem Row Level Security. Autenticação e autorização ficam no NestJS, para manter o projeto portável.
- Prisma + Supabase: usar a URL **direta** para migrações e a URL do **pooler** para a aplicação. Documentar ambas no `.env.example`.
- Antes de criar o projeto no Supabase, verificar se há região no Brasil (São Paulo) e escolhê-la.
- **Atenção ao plano gratuito do Render:** o serviço pode "dormir" por inatividade, o que atrasa webhooks. Documentar isso e tratar com reconciliação diária. Reavaliar plano pago se necessário.

## 4. Modelo de compartilhamento (central no projeto)

Toda entidade financeira pertence a **um usuário dono**. O acesso do outro usuário só existe por **concessão explícita**.

### Regras
1. Conta nova é privada.
2. O dono pode compartilhar uma conta com o parceiro com um nível:
   - `BALANCE_ONLY`: o parceiro vê apenas o saldo.
   - `FULL`: o parceiro vê saldo e transações (somente leitura).
3. O parceiro **nunca** edita ou exclui dados de contas do dono. Edição de categoria pessoal da transação é separada (ver abaixo).
4. O dono pode revogar o compartilhamento a qualquer momento, e o efeito é imediato.
5. A **visão conjunta** soma apenas contas compartilhadas dos dois, respeitando o nível de cada uma.
6. Conexões Open Finance e consentimentos pertencem a quem autorizou. O parceiro nunca os vê nem os gerencia.
7. Transferências entre contas dos dois **não** contam como receita nem despesa na visão conjunta (evitar dupla contagem).

### Entidades adicionais
- `partnerships`: vínculo entre dois usuários (convite, aceite, status).
- `account_shares`: conta, usuário com acesso, nível, datas de criação e revogação.

### Autorização
- A identidade vem **sempre** da sessão autenticada. Nunca confiar em `userId` enviado pelo cliente.
- Toda consulta passa por uma camada central que responde: "este usuário pode ver este recurso e em que nível?".
- Testes obrigatórios de isolamento: usuário A não acessa dados privados de B; revogação bloqueia imediatamente; `BALANCE_ONLY` não expõe transações.

## 5. Escopo funcional

### 5.1 Autenticação e perfil
- Cadastro, login, logout, proteção de rotas.
- MFA (TOTP) disponível desde cedo; planejar como obrigatório antes de conectar dados reais.
- Recuperação de senha (exige provedor de e-mail; decidir na Fase 2, sugestão Resend ou Amazon SES).
- Preferências: tema (claro, escuro, sistema), ocultar valores, moeda BRL.
- Convite e vínculo com o parceiro.

**Estratégia de sessão:**
- Web: cookie `HttpOnly`, `Secure`, `SameSite`, com proteção CSRF.
- Android: token de acesso curto + refresh token rotativo, guardados em `expo-secure-store`.
- Sessões revogáveis no servidor.

### 5.2 Dashboard
- Saldo consolidado das contas selecionadas.
- Receitas e despesas do período.
- Evolução financeira, gastos por categoria, movimentações recentes.
- Data e hora da última sincronização.
- Estados de carregamento, vazio, erro e dados desatualizados.
- Distinguir: saldo informado pela instituição, saldo calculado dos lançamentos e saldo consolidado.
- Nunca mostrar dado desatualizado como atual.
- Alternar entre visão **Minhas contas** e visão **Conjunta**.

### 5.3 Contas e carteiras
- Listar contas conectadas e carteiras manuais.
- Mostrar instituição, tipo, moeda, saldo, data de atualização.
- Criar carteira manual.
- Ativar/desativar conta no consolidado.
- Controlar compartilhamento de cada conta.
- Estado da conexão: ativa, aguardando autorização, expirada, com erro, desconectada.

### 5.4 Movimentações
- Listar, pesquisar e filtrar (data, conta, categoria, tipo, origem).
- Criar, editar e excluir lançamentos **manuais** (exclusão com confirmação).
- Recategorizar transações importadas **sem alterar os dados originais** do provedor.
- Diferenciar manual de importada.
- Transferências entre contas próprias não são receita nem despesa.
- Paginação e limites de consulta.

### 5.5 Categorias, orçamentos e metas
- Categorias iniciais (alimentação, transporte, moradia, saúde, educação, lazer, salário, outras receitas) e personalizadas.
- Limite de gasto por categoria e período.
- Metas com valor-alvo, acumulado e prazo.
- Alertas visuais que não dependam só de cor.
- Metas e orçamentos podem ser individuais ou do casal (definir no desenho da Fase 2).

### 5.6 Investimentos
- Na versão 1, tratados como **carteiras manuais** de investimento (valor atualizado manualmente), exibidos no patrimônio.
- Integração automática de investimentos depende da cobertura do provedor e fica para avaliação na Fase 4.

## 6. Integração Open Finance

- Via provedor/agregador, **isolado em módulo/adaptador** (trocável no futuro).
- Começar pelo **sandbox**. Não presumir que produção ou plano gratuito estarão disponíveis.
- Na Fase 4, verificar na documentação oficial: instituições cobertas, elegibilidade para uso pessoal, custos, limites, **suporte a webhook por transação** e prazos de consentimento.

### Fluxo de eventos
1. Provedor envia webhook de nova transação.
2. API valida a autenticidade conforme a documentação do provedor.
3. API grava o evento bruto em tabela `webhook_events` (PostgreSQL) e responde rapidamente.
4. Processador lê eventos pendentes e cria/atualiza transações, de forma **idempotente**, usando o identificador do provedor.
5. Registro do resultado em `sync_jobs`.

### Reconciliação
- Job diário compara o que o provedor informa com o que está salvo e corrige lacunas.
- Botão "Sincronizar agora" dispara a mesma rotina sob demanda, com limite de frequência.

### Requisitos
- Nunca pedir ou guardar senha bancária.
- Tokens do provedor somente no backend.
- Prevenir duplicidades por identificador do provedor + regras de reconciliação.
- Tratar consentimento expirado/revogado, falhas, limites e indisponibilidade.
- Mocks só em testes, claramente identificados.
- Pedir apenas as permissões necessárias.
- Registrar expiração do consentimento e avisar o usuário antes de vencer.

## 7. Modelo de dados (mínimo)

`users`, `sessions`, `partnerships`, `account_shares`, `financial_accounts`, `bank_connections`, `consents`, `transactions`, `categories`, `budgets`, `financial_goals`, `webhook_events`, `sync_jobs`, `audit_logs`.

**Regras:**
- Todo registro financeiro tem dono inequívoco.
- Valores em centavos inteiros (`BigInt`).
- Datas em UTC.
- Preservar o ID original do provedor; índices únicos contra duplicidade.
- Separar dados originais do provedor dos campos editáveis pelo usuário (categoria, notas).
- `createdAt` e `updatedAt` em tudo.
- Política de exclusão e retenção definida na Fase 2. **Caso a considerar:** o que acontece com os dados compartilhados se o vínculo do casal for desfeito (sugestão: compartilhamentos são revogados e cada um mantém apenas os próprios dados).

## 8. Segurança e privacidade

Prioridade máxima do projeto, por tratar dados bancários.

- HTTPS em tudo.
- Senhas com Argon2id.
- Proteção contra força bruta, abuso de endpoints e enumeração de contas (limite de tentativas, respostas genéricas).
- Cookies seguros e CSRF quando aplicável. CORS restrito.
- Validação de entrada no servidor em todos os endpoints.
- **Criptografia em repouso** pelo provedor **e** criptografia de campos sensíveis na aplicação (AES-256-GCM), com chave fora do banco.
- Segredos somente em variáveis de ambiente dos serviços (Render, Vercel, Supabase). Nunca no Git.
- Varredura de segredos no repositório e Dependabot ativos.
- Logs sem senhas, tokens ou dados bancários completos.
- Auditoria de ações relevantes (login, compartilhamento, revogação, conexão bancária, exclusão).
- Backups automáticos e **teste de restauração**.
- Exclusão de conta e dados.
- Revisão de LGPD e dos termos do provedor antes de usar dados reais.
- **Nenhum dado bancário real durante o desenvolvimento.** Somente dados fictícios e sandbox.

## 9. Interface e UX

- Visual premium e minimalista, inspirado em bancos digitais, **sem copiar marcas ou telas proprietárias**.
- Tokens de design centralizados (tema claro e escuro).
- Navegação: Início, Movimentações, Contas, Análises, Perfil/Configurações.
- Acessibilidade: contraste, rótulos, teclado na web, áreas de toque adequadas.
- Estado nunca comunicado só por cor.
- Estados de carregamento, vazio, sucesso e erro em toda tela com dados.

## 10. Estrutura do monorepo

```text
meufinanceiro/
├── apps/
│   ├── web/                 # Next.js
│   ├── mobile/              # React Native + Expo
│   └── api/                 # NestJS
├── packages/
│   ├── shared-types/
│   ├── validation/
│   └── design-tokens/
├── infrastructure/
├── docs/
│   ├── especificacao_final.md
│   ├── architecture.md
│   └── security.md
├── .github/workflows/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## 11. Fases

| Fase | Foco | Critério de conclusão |
|---|---|---|
| 0 | Base do projeto: monorepo, ferramentas, CI, docs, `.env.example` | `pnpm install`, lint, build e testes de exemplo rodam limpos; commit no GitHub |
| 1 | Design system e protótipo navegável com dados fictícios | Telas navegáveis e responsivas, web e Android |
| 2 | Backend, banco, autenticação, **modelo de compartilhamento**, CRUD | API testada, com testes de isolamento entre usuários |
| 3 | Integração das interfaces com a API | Controle financeiro manual completo, sem Open Finance |
| 4 | Open Finance em sandbox, webhooks, reconciliação | Fluxo validado no sandbox, limitações documentadas |
| 5 | Segurança e estabilização | Checklist de segurança concluído |
| 6 | Publicação | Deploy verificável, monitorado, com backup testado |

## 12. Fora do escopo da versão 1

Transferências e pagamentos reais, emissão de cartões, crédito, armazenamento de credenciais bancárias, Open Finance real fora do sandbox, microserviços, Redis/BullMQ, recursos pagos de provedores sem confirmar custos e elegibilidade.

## 13. Itens ainda em aberto (decidir nas fases indicadas)

- Provedor de Open Finance (Fase 4).
- Provedor de e-mail para recuperação de senha (Fase 2).
- Metas e orçamentos individuais vs. do casal (Fase 2).
- Política de retenção e de desfazer vínculo do casal (Fase 2).
- Plano do Render e custo de manter a API sempre ativa (Fase 6).
