import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';

/** Resultado do processamento de um evento de webhook. */
export type WebhookOutcome =
  { status: 'ignored'; reason: string } | { status: 'processed'; userIds: string[] };

/**
 * Consumidor dos eventos de webhook do Open Finance.
 *
 * Antes, `POST /open-finance/webhooks/:provider` gravava a linha em
 * `webhook_events` com `processed: false` e respondia `{ received: true }` — e
 * nada nunca lia aquela tabela. O efeito prático: o provedor avisava que um
 * item tinha sincronizado ou sido revogado, e o app só descobria na
 * conciliação diária. Índice em `processed` sem consumidor também é passivo:
 * a tabela só cresce.
 *
 * Quem chama: o cron diário (logo depois da conciliação). O evento em si serve
 * para descobrir **quais usuários** sincronizar mais cedo, e para marcar
 * conexão revogada/erro sem esperar a próxima tentativa.
 */
@Injectable()
export class WebhookConsumerService {
  private readonly logger = new Logger(WebhookConsumerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService
  ) {}

  /**
   * Processa os eventos pendentes mais antigos.
   *
   * Cada evento é marcado como processado **sempre** — inclusive quando é
   * ignorado por falta de item correspondente. Deixar pendente para sempre
   * faria a mesma linha ser relida em toda execução, sem chance de sucesso.
   */
  async processPending(limit = 50): Promise<{
    inspected: number;
    processed: number;
    ignored: number;
    usersSynced: number;
  }> {
    const events = await this.prisma.webhookEvent.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, provider: true, payload: true },
    });

    let processed = 0;
    let ignored = 0;
    const userIds = new Set<string>();

    for (const event of events) {
      try {
        const outcome = await this.handle(event.provider, event.payload);
        if (outcome.status === 'processed') {
          processed += 1;
          for (const userId of outcome.userIds) userIds.add(userId);
        } else {
          ignored += 1;
        }
      } catch (error) {
        // Erro inesperado num evento não pode travar a fila dos outros.
        ignored += 1;
        this.logger.error(
          `Webhook ${event.id} (${event.provider}) falhou: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processed: true },
      });
    }

    // Uma sincronização por usuário, mesmo com vários eventos dele na fila.
    let usersSynced = 0;
    for (const userId of userIds) {
      try {
        await this.sync.reconcileUser(userId, { trigger: 'daily' });
        usersSynced += 1;
      } catch (error) {
        this.logger.error(
          `Sincronização por webhook falhou para o usuário ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return { inspected: events.length, processed, ignored, usersSynced };
  }

  /**
   * Interpreta um evento.
   *
   * O payload é do provedor e não tem contrato estável, então a leitura é
   * defensiva: qualquer campo ausente vira "ignorado", nunca exceção. O
   * `itemId` (Pluggy) é o que liga o evento à `BankConnection.providerItemId`.
   */
  private async handle(provider: string, payload: unknown): Promise<WebhookOutcome> {
    if (typeof payload !== 'object' || payload === null) {
      return { status: 'ignored', reason: 'payload sem objeto' };
    }
    const data = payload as Record<string, unknown>;
    const itemId = readItemId(data);
    if (!itemId) return { status: 'ignored', reason: 'evento sem itemId' };

    const connections: Array<{ id: string; userId: string; status: string }> =
      await this.prisma.bankConnection.findMany({
        where: { providerItemId: itemId },
        select: { id: true, userId: true, status: true },
      });
    // Item de outro provedor ou de ninguém: nada a fazer (e não é erro).
    if (connections.length === 0) return { status: 'ignored', reason: 'item desconhecido' };

    const eventName = readEventName(data);
    const revoked = /revoke|deleted|disconnect|expired|error|login_error/i.test(eventName);

    if (revoked) {
      // Consentimento morto: parar de tentar sincronizar evita erro repetido e
      // deixa a tela mostrando que a conexão precisa ser refeita.
      await this.prisma.bankConnection.updateMany({
        where: { providerItemId: itemId },
        data: { status: 'expired' },
      });
      return {
        status: 'processed',
        userIds: connections.map((row: { userId: string }) => row.userId),
      };
    }

    // Evento informativo (item sincronizado, transações atualizadas): o que
    // interessa é antecipar a conciliação dos donos das conexões ativas.
    return {
      status: 'processed',
      userIds: connections
        .filter((row: { status: string }) => row.status === 'active')
        .map((row: { userId: string }) => row.userId),
    };
  }
}

/** `itemId` aparece em lugares diferentes conforme o tipo de evento. */
function readItemId(data: Record<string, unknown>): string | null {
  for (const key of ['itemId', 'item_id', 'id']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const nested = data.item;
  if (typeof nested === 'object' && nested !== null) {
    const value = (nested as Record<string, unknown>).id;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readEventName(data: Record<string, unknown>): string {
  for (const key of ['event', 'eventName', 'event_name', 'type', 'action']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
