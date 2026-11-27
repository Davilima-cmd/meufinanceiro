import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';

/**
 * Login por e-mail e senha.
 *
 * Além do limite por IP (`@Throttle` no controller), cada conta tem o seu
 * próprio bloqueio progressivo: força bruta distribuída troca de IP a cada
 * tentativa, mas continua mirando o mesmo e-mail. Falhar aqui **também** conta
 * como falha, e sucesso zera o histórico.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(
    private readonly authService: AuthService,
    private readonly throttle: LoginThrottleService
  ) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string) {
    if (this.throttle.isLocked(email)) {
      const retryAfter = this.throttle.retryAfterSeconds(email);
      // 429 com `Retry-After`: o cliente sabe esperar em vez de insistir.
      throw new HttpException(
        { message: 'Muitas tentativas. Tente novamente mais tarde.', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const user = await this.authService.validateUser(email, password);
    if (!user) {
      this.throttle.registerFailure(email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    this.throttle.registerSuccess(email);
    return user;
  }
}
