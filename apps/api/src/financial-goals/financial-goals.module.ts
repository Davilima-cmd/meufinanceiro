import { Module } from '@nestjs/common';
import { FinancialGoalsController } from './financial-goals.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialGoalsController],
})
export class FinancialGoalsModule {}
