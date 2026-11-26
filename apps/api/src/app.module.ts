import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard } from './auth/csrf.guard';
import { AccountAccessModule } from './common/account-access.module';
import { HealthModule } from './health/health.module';
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
import { SharingModule } from './sharing/sharing.module';
import { AllocationsModule } from './allocations/allocations.module';
import { RecurrencesModule } from './recurrences/recurrences.module';
import { NetWorthModule } from './net-worth/net-worth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    /**
     * Limite padrão de requisições por IP. Rotas sensíveis (login, cadastro,
     * recuperação de senha) apertam ainda mais com `@Throttle`.
     *
     * O limite global é generoso de propósito: uma tela do painel dispara
     * várias chamadas em paralelo. O que interessa é barrar força bruta, que
     * acontece em endpoints específicos.
     */
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
      },
    ]),
    PrismaModule,
    AccountAccessModule,
    HealthModule,
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
    SharingModule,
    AllocationsModule,
    RecurrencesModule,
    NetWorthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Depois do rate limit: bloqueia requisição com cookie de sessão que não
    // apresente o token CSRF (web em outro domínio, SameSite=None).
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
