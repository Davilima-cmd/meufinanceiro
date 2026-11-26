/**
 * Sonda de inicialização: monta um app Nest mínimo com um único módulo de
 * feature (`?m=<slug>`) para descobrir qual módulo derruba o processo no
 * runtime publicado. Só para diagnóstico; removida depois do deploy validado.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HealthModule } from '../src/health/health.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuthModule } from '../src/auth/auth.module';
import { AccountsModule } from '../src/accounts/accounts.module';
import { TransactionsModule } from '../src/transactions/transactions.module';
import { CategoriesModule } from '../src/categories/categories.module';
import { BudgetsModule } from '../src/budgets/budgets.module';
import { FinancialGoalsModule } from '../src/financial-goals/financial-goals.module';
import { OpenFinanceModule } from '../src/open-finance/open-finance.module';
import { SyncModule } from '../src/sync/sync.module';
import { AuditModule } from '../src/audit/audit.module';
import { MfaModule } from '../src/mfa/mfa.module';

const MODULES: Record<string, unknown> = {
  app: AppModule,
  health: HealthModule,
  prisma: PrismaModule,
  auth: AuthModule,
  accounts: AccountsModule,
  transactions: TransactionsModule,
  categories: CategoriesModule,
  budgets: BudgetsModule,
  goals: FinancialGoalsModule,
  openfinance: OpenFinanceModule,
  sync: SyncModule,
  audit: AuditModule,
  mfa: MfaModule,
};

export default async function handler(req: any, res: any) {
  const m = new URL(req.url, 'http://x').searchParams.get('m') ?? 'health';
  const target = MODULES[m];
  const out: Record<string, unknown> = { module: m, known: Boolean(target) };

  try {
    class ProbeModule {}
    Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), target].filter(Boolean) })(
      ProbeModule
    );
    const app = await NestFactory.create(ProbeModule as never, { logger: false });
    out.create = 'ok';
    await app.init();
    out.init = 'ok';
    await app.close();
    out.closed = 'ok';
  } catch (error) {
    const err = error as { name?: string; message?: string; stack?: string };
    out.error = {
      name: err?.name,
      message: String(err?.message ?? error)
        .replace(/:\/\/[^@\s/]*@/g, '://***@')
        .slice(0, 600),
      stack: String(err?.stack ?? '').slice(0, 800),
    };
  }

  res.setHeader('content-type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(out));
}
