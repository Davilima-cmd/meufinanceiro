import { Module } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
import { SandboxController } from './sandbox.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SandboxOpenFinanceProvider } from './sandbox.provider';
import { OPEN_FINANCE_PROVIDER } from './open-finance.provider';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [OpenFinanceController, SandboxController],
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
