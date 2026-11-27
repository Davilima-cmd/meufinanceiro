import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { EncryptionService } from '../encryption/encryption.service';
import { sensitiveFieldsExtension } from './sensitive-fields.extension';

@Global()
@Module({
  imports: [EncryptionModule],
  providers: [
    {
      // O token continua sendo `PrismaService`, mas o valor injetado é o cliente
      // estendido: é ele que aplica a cifragem dos campos sensíveis.
      provide: PrismaService,
      useFactory: async (encryption: EncryptionService) => {
        const client = new PrismaService();
        await client.$connect();
        return client.$extends(sensitiveFieldsExtension(encryption)) as unknown as PrismaService;
      },
      inject: [EncryptionService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
