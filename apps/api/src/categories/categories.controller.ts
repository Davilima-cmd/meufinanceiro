import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

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
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCategoryDto) {
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
    @Body() dto: UpdateCategoryDto
  ) {
    // `where` composto sem chave única é inválido no Prisma: updateMany
    // garante que só o dono altera a categoria.
    const updated = await this.prisma.category.updateMany({
      where: { id, userId: req.user.userId, isSystem: false },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return this.prisma.category.findUnique({ where: { id } });
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const deleted = await this.prisma.category.deleteMany({
      where: { id, userId: req.user.userId, isSystem: false },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Categoria não encontrada ou protegida pelo sistema');
    }
    return { id };
  }
}
