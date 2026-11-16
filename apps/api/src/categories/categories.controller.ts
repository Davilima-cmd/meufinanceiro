import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('categories')
@UseGuards(AuthGuard('jwt'))
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [{ userId: req.user.userId }, { userId: null }],
      },
      orderBy: [{ isSystem: 'asc' }, { name: 'asc' }],
    });
    return categories;
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: { name: string; color?: string }) {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        color: dto.color ?? '#246b61',
        userId: req.user.userId,
        isSystem: false,
      },
    });
    return category;
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: { name?: string; color?: string }
  ) {
    const category = await this.prisma.category.update({
      where: { id, userId: req.user.userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
    return category;
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.prisma.category.delete({
      where: { id, userId: req.user.userId },
    });
    return { id };
  }
}
