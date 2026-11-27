import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { RecurrencesModule } from '../recurrences/recurrences.module';
import { SyncModule } from '../sync/sync.module';
import { OpenFinanceModule } from '../open-finance/open-finance.module';

/**
 * Rotas de tarefa periódica para ambientes serverless.
 *
 * Existe porque o agendamento em processo (`setInterval` no `SyncModule`) não
 * sobrevive na Vercel: cada requisição é uma invocação curta.
 */
@Module({
  imports: [RecurrencesModule, SyncModule, OpenFinanceModule],
  controllers: [CronController],
})
export class CronModule {}
