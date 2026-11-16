FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/money/package.json packages/money/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/validation/package.json packages/validation/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "--filter", "@meufinanceiro/web", "dev"]
