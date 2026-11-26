import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';
import { SessionService } from './session.service';
import { readSessionCookie } from './session-cookie';

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
  /** Id da sessão (`sessions.id`). Tokens antigos, sem `sid`, são recusados. */
  sid?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionService
  ) {
    super({
      // Aceita o bearer (mobile, integrações) ou o cookie `HttpOnly` que a web
      // usa — nesse caso o JWT nunca fica exposto ao JavaScript da página.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: { headers?: { cookie?: string } } | null) =>
          request ? readSessionCookie(request as never) : null,
      ]),
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

    // Sessão revogada (logout, troca de senha, exclusão da conta) para de valer
    // imediatamente, sem esperar o token expirar.
    await this.sessions.assertActive(payload.sid, payload.sub);

    return { userId: payload.sub, sessionId: payload.sid };
  }
}
