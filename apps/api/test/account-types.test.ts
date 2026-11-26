import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ACCOUNT_TYPES, CreateAccountDto } from '../src/accounts/dto/account.dto';

/**
 * Regressão: "Dinheiro / carteira" devolvia 400 ao criar conta manual.
 *
 * A tela de contas oferece `cash` (Dinheiro / carteira), mas a lista aceita
 * pelo DTO não tinha esse valor — a API respondia
 * `400 type must be one of the following values: manual, checking, savings,
 * wallet, investment, credit`. Todo tipo oferecido pela interface precisa ser
 * aceito aqui, senão a opção é uma armadilha.
 */

/** Opções de `ACCOUNT_TYPES` em `apps/web/src/app/contas/page.tsx`. */
const TIPOS_OFERECIDOS_NA_INTERFACE = [
  'checking',
  'savings',
  'credit',
  'investment',
  'cash',
  'manual',
] as const;

async function errorsFor(type: string) {
  const dto = plainToInstance(CreateAccountDto, { name: 'Carteira', type });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateAccountDto.type', () => {
  it('aceita todos os tipos que a interface oferece', async () => {
    for (const type of TIPOS_OFERECIDOS_NA_INTERFACE) {
      const errors = await errorsFor(type);
      expect(errors, `tipo "${type}" deveria ser aceito`).toHaveLength(0);
    }
  });

  it('aceita `wallet` (nome antigo de carteira, já usado no banco)', async () => {
    expect(await errorsFor('wallet')).toHaveLength(0);
  });

  it('continua recusando tipo desconhecido', async () => {
    const errors = await errorsFor('cripto');
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('type');
  });

  it('a lista de tipos é a esperada, sem duplicata', () => {
    expect(new Set(ACCOUNT_TYPES).size).toBe(ACCOUNT_TYPES.length);
    for (const type of TIPOS_OFERECIDOS_NA_INTERFACE) {
      expect(ACCOUNT_TYPES).toContain(type);
    }
  });
});
