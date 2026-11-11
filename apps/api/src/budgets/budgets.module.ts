import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BudgetsController],
})
export class BudgetsModule {}
