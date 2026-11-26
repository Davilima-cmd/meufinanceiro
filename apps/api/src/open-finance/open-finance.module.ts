import { Module, Type } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
import { OpenFinanceAccountsController } from './open-finance-accounts.controller';
import { SandboxController } from './sandbox.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SandboxOpenFinanceProvider } from './sandbox.provider';
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
  // As rotas de vínculo de conta valem em qualquer ambiente: em produção elas
  // respondem "ainda não liberado" enquanto o provedor real não estiver
  // integrado, em vez de criar conta com dados do sandbox.
  const shared = [OpenFinanceController, OpenFinanceAccountsController];
  return process.env.NODE_ENV === 'production' ? shared : [...shared, SandboxController];
}

const CONTROLLERS = buildControllers();

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: CONTROLLERS,
  providers: [
    SandboxOpenFinanceProvider,
    {
      provide: OPEN_FINANCE_PROVIDER,
      useExisting: SandboxOpenFinanceProvider,
    },
  ],
  exports: [OPEN_FINANCE_PROVIDER],
})
export class OpenFinanceModule {}
