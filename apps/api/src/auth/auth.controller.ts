import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import {
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';
import { clearSessionCookies, csrfTokenFor, setSessionCookies } from './session-cookie';
import { AuditLog, AuditAction } from '../audit/audit-log.decorator';
import { SkipCsrf } from '../common/skip-csrf.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; sessionId?: string };
}

/** O que usamos da resposta HTTP: escrever/limpar cookies. */
interface CookieResponse {
  cookie(name: string, value: string, options?: Record<string, unknown>): unknown;
  clearCookie(name: string, options?: Record<string, unknown>): unknown;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService
  ) {}

  @Post('register')
  // Rota pública: não depende de sessão, então cookie velho no navegador não
  // pode bloquear o cadastro (era o 403 ao "criar conta").
  @SkipCsrf()
  // Cadastro em massa por script é abuso: 5 por minuto por IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @AuditLog(AuditAction.REGISTER)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  // Pública: o objetivo aqui é justamente obter uma sessão.
  @SkipCsrf()
  // Força bruta de senha: 10 tentativas por minuto por IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('local'))
  @AuditLog(AuditAction.LOGIN)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: CookieResponse) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // MFA obrigatória: não libera o JWT completo sem um token TOTP válido.
    if (user.mfaEnabled) {
      const tempToken = this.authService.generateTempToken(user.id);
      // Sem `userId` no corpo: o identificador já vai assinado dentro do
      // `tempToken` e a web não precisa dele. Devolvê-lo daria a qualquer um
      // que acertasse a senha o id interno da conta.
      return { mfaRequired: true, tempToken };
    }

    const { token, sessionId } = await this.sessions.create(user.id);
    // O token CSRF é derivado do **id da sessão** (e não do JWT): assim
    // `GET /auth/status` consegue recalculá-lo e devolvê-lo à web.
    const csrfToken = csrfTokenFor(sessionId);
    // A web ignora o token do corpo e usa o cookie `HttpOnly`; o mobile guarda
    // o bearer. Os dois caminhos valem a mesma sessão.
    setSessionCookies(res, token, csrfToken);
    // `csrfToken` no corpo: quando web e API estão em domínios diferentes, o
    // navegador não deixa o JS ler o cookie `mf_csrf` (pertence ao domínio da
    // API). Sem esse valor a web não tinha como montar o header e toda escrita
    // respondia 403. O corpo da resposta é same-origin-only, então devolvê-lo
    // aqui não enfraquece o double submit.
    return { user, token, csrfToken };
  }

  /**
   * Sempre responde `{ requested: true }`, exista ou não a conta, para não
   * revelar quais e-mails estão cadastrados.
   */
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  // Pública: quem esqueceu a senha pode estar com sessão expirada no navegador.
  @SkipCsrf()
  // Cada pedido grava um token e (em produção) envia e-mail: 3 por minuto.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @AuditLog(AuditAction.PASSWORD_RESET_REQUEST)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.request(dto.email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditLog(AuditAction.PASSWORD_RESET)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.password);
  }

  /**
   * Encerra a sessão do token usado nesta requisição.
   *
   * Diferente de apagar o token no navegador, isto invalida de fato o JWT: a
   * linha em `sessions` some e qualquer requisição futura com ele recebe `401`.
   */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.LOGOUT)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: CookieResponse) {
    if (req.user.sessionId) {
      await this.sessions.revoke(req.user.sessionId, req.user.userId);
    }
    clearSessionCookies(res);
    return { revoked: true };
  }

  /** Encerra todas as sessões do usuário (inclusive a atual). */
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  @AuditLog(AuditAction.LOGOUT)
  async logoutAll(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: CookieResponse
  ) {
    const revoked = await this.sessions.revokeAll(req.user.userId);
    clearSessionCookies(res);
    return { revoked, sessions: 0 };
  }

  /**
   * `GET /auth/status`: valida a sessão e devolve o usuário.
   *
   * É o endpoint que o frontend usa ao abrir o app: se o token foi revogado em
   * outro lugar, a resposta é `401` e a interface volta para o login em vez de
   * mostrar dados que não vão poder ser salvos.
   */
  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async status(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.profile(req.user.userId);
    const sessions = await this.sessions.list(req.user.userId);
    return {
      authenticated: true,
      user,
      sessionId: req.user.sessionId ?? null,
      sessions: sessions.length,
      // Recalculado a cada carga da página: a web recupera o valor CSRF mesmo
      // sem conseguir ler o cookie (domínios diferentes) e sem precisar
      // guardá-lo no navegador.
      csrfToken: req.user.sessionId ? csrfTokenFor(req.user.sessionId) : null,
    };
  }

  /**
   * Exclusão da conta (irreversível).
   *
   * Exige a senha no corpo: sessão sozinha não é prova suficiente para apagar
   * todo o histórico financeiro, e a senha confere que o dono está ali agora.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('account')
  @UseGuards(AuthGuard('jwt'))
  // Erro de senha aqui é tentativa de destruição: limite curto.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @AuditLog(AuditAction.ACCOUNT_DELETE)
  async deleteAccount(@Req() req: AuthenticatedRequest, @Body() dto: DeleteAccountDto) {
    await this.authService.assertPassword(req.user.userId, dto.password);
    return this.authService.deleteAccount(req.user.userId);
  }
}
