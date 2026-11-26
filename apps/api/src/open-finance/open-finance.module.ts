import { Module, Type } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
import { OpenFinanceAccountsController } from './open-finance-accounts.controller';
import { SandboxController } from './sandbox.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SandboxOpenFinanceProvider } from './sandbox.provider';
import { PluggyOpenFinanceProvider } from './pluggy.provider';
import { PluggyClient } from './pluggy.client';
import { OPEN_FINANCE_PROVIDER } from './open-finance.provider';
import { SyncModule } from '../sync/sync.module';

/**
 * Controllers do módulo de Open Finance.
 *
 * O `SandboxController` é registrado apenas fora de produção: em produção o
 * provedor sandbox não existe, e manter as rotas expostas permitiria
 * injetar transações e consentimentos.
 */
export function buildControllers(): Array<Type<any>> {
  const shared = [OpenFinanceController, OpenFinanceAccountsController];
  return process.env.NODE_ENV === 'production' ? shared : [...shared, SandboxController];
}

const CONTROLLERS = buildControllers();

/**
 * Escolha do provedor.
 *
 * - **Pluggy** (`PLUGGY_CLIENT_ID` + `PLUGGY_CLIENT_SECRET` definidos): Open
 *   Finance de verdade, com consentimento do usuário no app do banco.
 * - **Sandbox**: dados fictícios, só fora de produção (ou com liberação
 *   explícita) para desenvolvimento e testes de fluxo.
 *
 * A escolha é lida no boot: trocar de provedor exige redeploy, o que é
 * proposital — ninguém deve alternar entre dados reais e fictícios em runtime.
 */
export function activeProviderClass(): Type<unknown> {
  return PluggyClient.configured() ? PluggyOpenFinanceProvider : SandboxOpenFinanceProvider;
}

const PROVIDER = activeProviderClass();

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: CONTROLLERS,
  providers: [
    SandboxOpenFinanceProvider,
    PluggyOpenFinanceProvider,
    {
      provide: OPEN_FINANCE_PROVIDER,
      useExisting: PROVIDER,
    },
  ],
  exports: [OPEN_FINANCE_PROVIDER],
})
export class OpenFinanceModule {}
