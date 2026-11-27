import { Module } from '@nestjs/common';
import { NetWorthController } from './net-worth.controller';
import { NetWorthService } from './net-worth.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NetWorthController],
  providers: [NetWorthService],
  exports: [NetWorthService],
})
export class NetWorthModule {}
