import { Module, Type } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
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
  return process.env.NODE_ENV === 'production'
    ? [OpenFinanceController]
    : [OpenFinanceController, SandboxController];
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
