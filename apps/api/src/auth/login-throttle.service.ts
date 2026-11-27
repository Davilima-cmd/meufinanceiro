import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

/**
 * Bloqueio progressivo por **conta**, complementando o limite por IP.
 *
 * O rate limit por IP não segura força bruta distribuída: quem ataca usa vários
 * IPs e continua tentando a mesma conta. Aqui a chave é o e-mail (normalizado),
 * então a tentativa custa o mesmo para o atacante independentemente de quantos
 * IPs ele use.
 *
 * Escolhas de projeto:
 *
 * - **memória do processo**, sem Redis: o app roda em serverless e o objetivo é
 *   encarecer o ataque, não ser um contador global exato. Cada instância tem a
 *   sua janela, o que já derruba tentativa sequencial em rajada.
 * - **janela deslizante simples**: 5 falhas em 15 min bloqueiam por 15 min; o
 *   contador zera no primeiro login bem-sucedido.
 * - **chave é hash do e-mail**: o mapa em memória não guarda e-mail em claro
 *   (nada de PII em heap de processo que pode ir para um dump).
 * - **não revela** se a conta existe: o bloqueio responde igual para e-mail
 *   cadastrado ou não (e o login já responde sempre "credenciais inválidas").
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
/** Teto do mapa: sem isto, e-mails aleatórios viram consumo de memória. */
const MAX_TRACKED_KEYS = 10_000;

type Entry = { failures: number; lastAt: number; lockedUntil: number };

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly entries = new Map<string, Entry>();

  /** `true` quando a conta está bloqueada agora. */
  isLocked(key: string): boolean {
    const entry = this.entries.get(this.normalize(key));
    if (!entry) return false;
    if (entry.lockedUntil > Date.now()) return true;
    if (entry.lockedUntil !== 0) this.entries.delete(this.normalize(key));
    return false;
  }

  /** Registra uma tentativa que falhou; bloqueia ao passar do limite. */
  registerFailure(key: string, now = Date.now()): void {
    const hashed = this.normalize(key);
    this.evictIfNeeded(now);

    const entry = this.entries.get(hashed) ?? { failures: 0, lastAt: now, lockedUntil: 0 };
    // Fora da janela, a contagem recomeça.
    if (now - entry.lastAt > WINDOW_MS) {
      entry.failures = 0;
    }
    entry.failures += 1;
    entry.lastAt = now;

    if (entry.failures >= MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCK_MS;
      entry.failures = 0;
      this.logger.warn('Login bloqueado temporariamente após tentativas repetidas');
    }

    this.entries.set(hashed, entry);
  }

  /** Login bem-sucedido limpa o histórico daquela conta. */
  registerSuccess(key: string): void {
    this.entries.delete(this.normalize(key));
  }

  /** Quanto falta do bloqueio, em segundos (para a mensagem da API). */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.entries.get(this.normalize(key));
    if (!entry || entry.lockedUntil <= now) return 0;
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }

  /** Só para teste: limpa o estado. */
  reset(): void {
    this.entries.clear();
  }

  /**
   * Chave = SHA-256 do e-mail normalizado.
   *
   * Hash e não o e-mail em claro: o mapa é memória de processo e um dump não
   * deve virar lista de e-mails tentados.
   */
  private normalize(key: string): string {
    return createHash('sha256').update(key.trim().toLowerCase()).digest('hex').slice(0, 32);
  }

  private evictIfNeeded(now: number): void {
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil !== 0 && entry.lockedUntil <= now) this.entries.delete(key);
      else if (now - entry.lastAt > WINDOW_MS) this.entries.delete(key);
    }
    // Ainda cheio: descarta as entradas mais antigas (FIFO da Map).
    while (this.entries.size >= MAX_TRACKED_KEYS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
