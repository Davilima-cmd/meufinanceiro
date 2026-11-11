import { Module } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OpenFinanceController],
})
export class OpenFinanceModule {}
