import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';

/**
 * Escopo do token JWT.
 *
 * - `full`: token definitivo, emitido depois que o segundo fator (quando
 *   existir) foi confirmado. Liberado para todas as rotas protegidas.
 * - `mfa_pending`: token temporário (5 min) emitido no login quando o usuário
 *   tem MFA habilitada. Serve APENAS para concluir a verificação do segundo
 *   fator em `POST /auth/mfa/verify`.
 *
 * Sem essa distinção, o token temporário era aceito em qualquer rota — o
 * segundo fator virava opcional.
 */
export type TokenScope = 'full' | 'mfa_pending';

export type JwtPayload = {
  sub: string;
  scope?: TokenScope;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: resolveJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens legados (sem `scope`) e tokens temporários de MFA não têm acesso
    // às rotas normais: só ao endpoint de verificação do segundo fator.
    if (payload.scope !== 'full') {
      throw new UnauthorizedException(
        payload.scope === 'mfa_pending' ? 'Verificação de segundo fator pendente' : 'Token inválido'
      );
    }
    return { userId: payload.sub };
  }
}
