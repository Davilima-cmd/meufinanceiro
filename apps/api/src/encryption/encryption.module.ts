import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EncryptionService,
      useFactory: (config: ConfigService) => new EncryptionService(config),
      inject: [ConfigService],
    },
  ],
  exports: [EncryptionService],
})
export class EncryptionModule {}
