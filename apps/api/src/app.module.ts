import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetsModule } from './budgets/budgets.module';
import { FinancialGoalsModule } from './financial-goals/financial-goals.module';
import { OpenFinanceModule } from './open-finance/open-finance.module';
import { SyncModule } from './sync/sync.module';
import { AuditModule } from './audit/audit.module';
import { MfaModule } from './mfa/mfa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    FinancialGoalsModule,
    OpenFinanceModule,
    SyncModule,
    AuditModule,
    MfaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
