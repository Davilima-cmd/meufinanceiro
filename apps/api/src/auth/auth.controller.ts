import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { RegisterDto } from './dto/auth.dto';
import { LoginDto } from './dto/auth.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @AuditLog(AuditAction.REGISTER)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UseGuards(AuthGuard('local'))
  @AuditLog(AuditAction.LOGIN)
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // MFA obrigatória: não libera o JWT completo sem um token TOTP válido.
    if (user.mfaEnabled) {
      const tempToken = this.authService.generateTempToken(user.id);
      return { mfaRequired: true, userId: user.id, tempToken };
    }

    const token = this.authService.generateToken(user.id);
    return { user, token };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('account')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.ACCOUNT_DELETE)
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    return this.authService.deleteAccount(req.user.userId);
  }
}
