import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma da aplicação.
 *
 * Os campos sensíveis (`Consent.externalId`, `BankConnection.providerAccountId`)
 * são cifrados em repouso por uma Client Extension (`sensitive-fields.extension.ts`),
 * aplicada no `PrismaModule` sobre o cliente devolvido por este serviço: quem
 * recebe `PrismaService` por injeção recebe o cliente já estendido, então a
 * cifragem vale para qualquer consulta, inclusive escritas fora dos controllers.
 *
 * O middleware `$use`, que fazia isso antes, foi removido no Prisma 6.14.
 */
@Injectable()
export class PrismaService extends PrismaClient {}
