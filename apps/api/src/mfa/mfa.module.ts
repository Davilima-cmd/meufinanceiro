import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { AuthModule } from '../auth/auth.module';
import { MfaService } from './mfa.service';

@Global()
@Module({
  imports: [PrismaModule, EncryptionModule, AuthModule],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
