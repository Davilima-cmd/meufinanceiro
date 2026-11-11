import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncService } from './sync.service';
import { BankProviderAdapter, SandboxBankProviderAdapter } from './provider.adapter';

/**
 * Módulo de sincronização.
 *
 * O provedor de sandbox é injetado por padrão; trocar a implementação de
 * `BankProviderAdapter` quando o provedor real estiver disponível (Fase 4).
 * A varredura diária roda em processo (sem Redis/BullMQ, conforme a
 * especificação) e dispara a mesma rotina do botão "Sincronizar agora".
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SyncService,
    { provide: BankProviderAdapter, useClass: SandboxBankProviderAdapter },
  ],
  exports: [SyncService],
})
export class SyncModule implements OnModuleInit {
  constructor(private readonly syncService: SyncService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;

    // Verifica a cada hora se algum usuário está devedor de reconciliação diária.
    setInterval(
      () => void this.syncService.runDailyReconciliation(),
      60 * 60 * 1000,
    );
  }
}
