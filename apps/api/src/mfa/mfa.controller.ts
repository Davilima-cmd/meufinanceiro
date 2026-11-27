import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { MfaService } from './mfa.service';
import { LoginThrottleService } from '../auth/login-throttle.service';
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
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService
  ) {}

  /**
   * Gera um segredo novo o servidor e devolve o QR code.
   *
   * Antes o cliente mandava o segredo que quisesse por query string, gerando um
   * QR code para um segredo arbitrário (e o segredo ia parar em log de acesso,
   * histórico do navegador e cache do proxy, porque era uma URL). Agora o
   * segredo nasce aqui, com CSPRNG, e só existe na resposta autenticada.
   */
  @Get('secret')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.MFA_ENABLE)
  async newSecret(@Req() req: AuthenticatedRequest) {
    const user = await this.mfaService.profileForMfa(req.user.userId);
    return this.mfaService.generateSecret(req.user.userId, user.email);
  }

  /**
   * QR code (data URL) do segredo **pendente** do usuário.
   *
   * Antes a rota aceitava `?secret=` e desenhava o QR de qualquer segredo
   * informado — e uma URL cai em log de acesso, histórico do navegador e cache
   * de proxy. O segredo agora vem do servidor (o devolvido por
   * `GET /auth/mfa/secret`), então não há nada para o cliente mandar.
   */
  @Get('qr-code')
  @UseGuards(AuthGuard('jwt'))
  async qrCode(@Req() req: AuthenticatedRequest) {
    const otpauthUrl = await this.mfaService.pendingOtpauthUrl(req.user.userId);
    if (!otpauthUrl) {
      throw new BadRequestException('Nenhum segredo pendente. Comece em GET /auth/mfa/secret.');
    }
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return { qrCode, otpauthUrl };
  }

  /**
   * Habilita MFA confirmando o primeiro código do segredo pendente.
   *
   * O corpo traz **só** o código: o segredo é o que o servidor guardou em
   * `GET /auth/mfa/secret`. Aceitar `secret` do cliente permitia ativar o
   * segundo fator com um segredo que o atacante já conhece.
   */
  @Post('enable')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.MFA_ENABLE)
  async enable(@Req() req: AuthenticatedRequest, @Body() dto: EnableMfaDto) {
    const user = await this.mfaService.enableMFA(req.user.userId, dto.token);
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
    // 6 dígitos são só 1 milhão de combinações: o limite por IP não segura
    // força bruta distribuída. Cada usuário tem o seu próprio bloqueio.
    const key = `mfa:${req.user.userId}`;
    if (this.throttle.isLocked(key)) {
      throw new HttpException(
        {
          message: 'Muitas tentativas de código. Tente novamente mais tarde.',
          retryAfter: this.throttle.retryAfterSeconds(key),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const valid = await this.mfaService.validateMFA(req.user.userId, dto.token);
    if (!valid) {
      this.throttle.registerFailure(key);
      throw new NotFoundException('Token TOTP inválido');
    }
    this.throttle.registerSuccess(key);
    // A sessão de verdade só nasce depois do segundo fator.
    const { token, sessionId } = await this.sessions.create(req.user.userId);
    const csrfToken = csrfTokenFor(sessionId);
    setSessionCookies(res, token, csrfToken);
    // Mesmo motivo do login: a web precisa do valor para o header CSRF quando
    // o cookie fica no domínio da API.
    return { token, csrfToken };
  }

  /**
   * Desabilita MFA do usuário logado.
   *
   * Exige o código do app autenticador: desligar o segundo fator é a primeira
   * coisa que alguém com a sessão sequestrada tentaria.
   */
  @Post('disable')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.MFA_DISABLE)
  async disable(@Req() req: AuthenticatedRequest, @Body() dto: VerifyMfaDto) {
    const user = await this.mfaService.disableMFA(req.user.userId, dto.token);
    return { mfaEnabled: false, user };
  }
}
