import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { MfaService } from './mfa.service';
import { EnableMfaDto, VerifyMfaDto } from './dto/mfa.dto';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { SessionService } from '../auth/session.service';
import { csrfTokenFor, setSessionCookies } from '../auth/session-cookie';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import QRCode from 'qrcode';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService
  ) {}

  /** Retorna o QR code (data URL) e a URL otpauth para um segredo TOTP. */
  @Get('qr-code')
  @UseGuards(AuthGuard('jwt'))
  async qrCode(@Query('secret') secret: string) {
    if (!secret) {
      throw new NotFoundException('Informe o parâmetro ?secret=');
    }
    const otpauthUrl = `otpauth://totp/MeuFinanceiro:${encodeURIComponent(
      secret
    )}?secret=${secret}&issuer=MeuFinanceiro`;
    // Gera a URL otpauth de forma consistente com o serviço, quando possível.
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return { qrCode, otpauthUrl };
  }

  /** Habilita MFA após confirmar o token contra o segredo informado. */
  @Post('enable')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.MFA_ENABLE)
  async enable(@Req() req: AuthenticatedRequest, @Body() dto: EnableMfaDto) {
    const user = await this.mfaService.enableMFA(req.user.userId, dto.token, dto.secret);
    return { mfaEnabled: true, user };
  }

  /**
   * Valida o token TOTP e troca o token temporário de sessão MFA pelo JWT
   * definitivo.
   *
   * Usa a guard 'mfa-session', que aceita APENAS tokens com
   * `scope: 'mfa_pending'`. O token completo ('jwt') não é aceito aqui, e o
   * token temporário não é aceito em nenhuma outra rota.
   */
  @Post('verify')
  // Etapa de login: a sessão definitiva só nasce no fim, então exigir CSRF de
  // um cookie antigo aqui travaria quem está tentando entrar.
  @SkipCsrf()
  // 6 dígitos são 1 milhão de combinações, mas o código vale 30s: limite curto
  // impede varredura dentro da janela.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('mfa-session'))
  async verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyMfaDto,
    @Res({ passthrough: true })
    res: {
      cookie(name: string, value: string, options?: Record<string, unknown>): unknown;
    }
  ) {
    const valid = await this.mfaService.validateMFA(req.user.userId, dto.token);
    if (!valid) {
      throw new NotFoundException('Token TOTP inválido');
    }
    // A sessão de verdade só nasce depois do segundo fator.
    const { token, sessionId } = await this.sessions.create(req.user.userId);
    const csrfToken = csrfTokenFor(sessionId);
    setSessionCookies(res, token, csrfToken);
    // Mesmo motivo do login: a web precisa do valor para o header CSRF quando
    // o cookie fica no domínio da API.
    return { token, csrfToken };
  }

  /** Desabilita MFA do usuário logado. */
  @Post('disable')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.MFA_DISABLE)
  async disable(@Req() req: AuthenticatedRequest) {
    const user = await this.mfaService.disableMFA(req.user.userId);
    return { mfaEnabled: false, user };
  }
}
