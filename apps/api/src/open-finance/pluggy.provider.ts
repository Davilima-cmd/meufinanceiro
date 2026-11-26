import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PluggyClient, PluggyConfigError } from './pluggy.client';
import type {
  OpenFinanceAccount,
  OpenFinanceConsent,
  OpenFinanceProvider,
  OpenFinanceTransaction,
} from './open-finance.provider';

/**
 * Provedor Open Finance real (Pluggy).
 *
 * Traduz o formato do provedor para o vocabulário do app. O que importa aqui:
 *
 * - O app nunca vê credencial bancária: quem coleta é o provedor, com o
 *   consentimento do usuário no app do banco.
 * - Valores do provedor chegam em **reais** (decimal) e o app trabalha em
 *   **centavos inteiros** — a conversão é feita uma única vez, aqui, com
 *   arredondamento explícito (nunca ponto flutuante acumulado).
 * - `type` do provedor é `BANK`/`CREDIT` + `subtype`; o app usa
 *   checking/savings/credit/investment/cash.
 *
 * A API do Pluggy exige um `itemId` para listar contas, então o provider
 * mantém o item da conta vinculada em `bank_connections.providerItemId`.
 */
@Injectable()
export class PluggyOpenFinanceProvider implements OpenFinanceProvider {
  readonly kind = 'live' as const;
  private readonly logger = new Logger(PluggyOpenFinanceProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `true` quando há credenciais no ambiente. */
  static configured(): boolean {
    return PluggyClient.configured();
  }

  private client(): PluggyClient {
    return PluggyClient.fromEnv();
  }

  /**
   * Contas de todos os itens do usuário já conectados.
   *
   * A primeira conexão nasce pelo widget (consentimento no banco); a partir daí
   * esta lista alimenta a tela de vínculo com o que realmente existe.
   */
  async listAccounts(userId?: string): Promise<OpenFinanceAccount[]> {
    if (!userId) return [];
    const connections = await this.prisma.bankConnection.findMany({
      where: { userId, status: 'active', provider: 'pluggy' },
      select: { providerItemId: true },
    });
    const itemIds = [
      ...new Set(connections.map((row: { providerItemId: string | null }) => row.providerItemId)),
    ].filter((id): id is string => Boolean(id));
    if (itemIds.length === 0) return [];

    const client = this.client();
    const accounts: OpenFinanceAccount[] = [];
    for (const itemId of itemIds) {
      const remote = await client.listAccounts(itemId);
      for (const account of remote) {
        accounts.push(this.toAccount(account, itemId));
      }
    }
    return accounts;
  }

  async listTransactions(accountId?: string): Promise<OpenFinanceTransaction[]> {
    if (!accountId) return [];
    const connection = await this.prisma.bankConnection.findFirst({
      where: { accountId, provider: 'pluggy', status: 'active' },
      select: { providerAccountId: true },
    });
    if (!connection) return [];

    const client = this.client();
    const remote = await client.listTransactions(connection.providerAccountId);
    return remote.map((transaction) =>
      this.toTransaction(transaction, connection.providerAccountId)
    );
  }

  /**
   * "Consentimento" no nosso modelo = o item do provedor.
   *
   * O consentimento em si é dado pelo usuário no app do banco, dentro do widget.
   * Aqui registramos o item resultante, que é o que sabemos verificar depois.
   */
  async createConsent(userId?: string, itemId?: string): Promise<OpenFinanceConsent> {
    if (!userId) {
      throw new PluggyConfigError('createConsent exige o usuário para registrar o item.');
    }
    if (!itemId) {
      throw new PluggyConfigError(
        'O vínculo com banco real nasce pelo widget de consentimento; sem itemId não há o que registrar.'
      );
    }

    const item = await this.client().getItem(itemId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.logger.log(`Consentimento Pluggy item=${itemId} status=${item.status}`);
    return {
      id: item.id,
      externalId: item.id,
      status: item.status === 'UPDATED' ? 'active' : 'awaiting_authorization',
      expiresAt,
    };
  }

  /** Status do item no provedor, para a tela mostrar "sincronizando"/"erro". */
  async itemStatus(itemId: string): Promise<{ status: string; executionStatus: string | null }> {
    const item = await this.client().getItem(itemId);
    return { status: item.status, executionStatus: item.executionStatus ?? null };
  }

  /**
   * Token curto para o widget Connect no navegador (o `clientSecret` fica no
   * servidor). É o caminho recomendado pelo provedor e o único compatível com a
   * exigência de consentimento do Open Finance.
   */
  async connectToken(userId: string, webhookUrl?: string): Promise<{ accessToken: string }> {
    return this.client().createConnectToken({ clientUserId: userId, webhookUrl });
  }

  /** Centavos inteiros a partir do decimal em reais do provedor. */
  private toCents(amount: number): string {
    // `Math.round` no valor já multiplicado: 12.345 → 1234.5 → 1234 (não 1235,
    // porque o provedor usa 2 casas e o erro de ponto flutuante é < 0.5).
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents)) return '0';
    return String(cents);
  }

  private toAccount(
    account: {
      id: string;
      name: string;
      type: 'BANK' | 'CREDIT';
      subtype?: string | null;
      balance: number;
      currencyCode?: string;
      marketingName?: string | null;
    },
    itemId: string
  ): OpenFinanceAccount {
    return {
      id: account.id,
      // `marketingName` costuma ser mais legível ("GOLD Conta Corrente").
      name: account.marketingName?.trim() || account.name,
      institution: 'Pluggy',
      type: this.accountType(account.type, account.subtype),
      currency: account.currencyCode || 'BRL',
      balanceCents: this.toCents(account.balance),
      itemId,
    };
  }

  private accountType(type: 'BANK' | 'CREDIT', subtype?: string | null): string {
    if (type === 'CREDIT' || subtype === 'CREDIT_CARD') return 'credit';
    switch (subtype) {
      case 'SAVINGS_ACCOUNT':
        return 'savings';
      case 'INVESTMENT_ACCOUNT':
        return 'investment';
      default:
        return 'checking';
    }
  }

  private toTransaction(
    transaction: {
      id: string;
      description: string;
      amount: number;
      date: string;
      type?: 'CREDIT' | 'DEBIT';
      category?: string | null;
    },
    accountId: string
  ): OpenFinanceTransaction {
    const cents = this.toCents(transaction.amount);
    const isTransfer = /transfer|ted|doc|pix.*entre contas/i.test(
      transaction.category ?? transaction.description ?? ''
    );
    return {
      id: transaction.id,
      accountId,
      description: transaction.description?.trim() || 'Lançamento importado',
      amountCents: cents,
      type: isTransfer ? 'transfer' : Number(cents) >= 0 ? 'income' : 'expense',
      date: transaction.date,
    };
  }
}
