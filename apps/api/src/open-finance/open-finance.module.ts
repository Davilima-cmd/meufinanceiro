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

/**
 * Sandbox fictício só existe fora de produção.
 *
 * Antes, com o Pluggy desconfigurado, **produção** também caía neste provider e
 * criava conta bancária com saldo inventado dentro da conta real do usuário. Uma
 * variável de ambiente não pode ser o que separa dado real de dado fictício: em
 * produção, sem credenciais, o app responde que a conexão não está configurada.
 */
export function sandboxAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Provedor efetivo do ambiente (sandbox em produção = nenhum). */
export function resolveProviderClass(): Type<unknown> | null {
  const active = activeProviderClass();
  if (active === SandboxOpenFinanceProvider && !sandboxAllowed()) return null;
  return active;
}

const PROVIDER = resolveProviderClass();

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: CONTROLLERS,
  providers: [
    SandboxOpenFinanceProvider,
    PluggyOpenFinanceProvider,
    // Em produção sem credenciais do provedor não há provedor: quem injeta
    // recebe `null` e responde erro de configuração, em vez de dado fictício.
    ...(PROVIDER
      ? [
          {
            provide: OPEN_FINANCE_PROVIDER,
            useExisting: PROVIDER,
          },
        ]
      : [{ provide: OPEN_FINANCE_PROVIDER, useValue: null }]),
  ],
  exports: [OPEN_FINANCE_PROVIDER],
})
export class OpenFinanceModule {}
