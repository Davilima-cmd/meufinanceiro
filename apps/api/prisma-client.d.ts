/**
 * Tipagem mínima do cliente Prisma enquanto `prisma generate` não foi executado.
 *
 * O cliente real (com todos os modelos tipados) é gerado no CI e na imagem
 * Docker. Sem ele, `@prisma/client` exporta apenas `any`, e o `pnpm typecheck`
 * quebraria com erros de `implicit any` em callbacks. Este shim cobre somente o
 * caso de o cliente gerado estar ausente: os tipos explícitos do shim são
 * substituídos pelos tipos reais assim que `prisma generate` roda.
 */
declare module '@prisma/client' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class PrismaClient {
    constructor(options?: any);
    [key: string]: any;
  }
}
