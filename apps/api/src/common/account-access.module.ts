import { Global, Module } from '@nestjs/common';
import { AccountAccessService, WritableAccountGuard } from './account-access.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Autorização de conta compartilhada, disponível para todos os módulos.
 * É global porque a regra ("só o dono escreve") vale para qualquer controller.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AccountAccessService, WritableAccountGuard],
  exports: [AccountAccessService, WritableAccountGuard],
})
export class AccountAccessModule {}
