import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';
import type { JwtPayload } from './jwt.strategy';

/**
 * Strategy do token temporário de sessão MFA.
 *
 * Aceita APENAS tokens com `scope: 'mfa_pending'` — os de 5 minutos emitidos
 * no login quando o usuário tem MFA habilitada. É o único token aceito por
 * `POST /auth/mfa/verify`.
 *
 * O `JwtStrategy` ('jwt'), usado no resto da API, exige `scope: 'full'`: o
 * token temporário não abre nenhuma outra rota.
 */
@Injectable()
export class MfaSessionStrategy extends PassportStrategy(Strategy, 'mfa-session') {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: resolveJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.scope !== 'mfa_pending') {
      throw new UnauthorizedException('Sessão MFA inválida ou expirada');
    }
    return { userId: payload.sub };
  }
}
