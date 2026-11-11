import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { MfaService } from './mfa.service';

@Global()
@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
