import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaSetup } from '@/components/mfa-setup';

/**
 * A tela de segundo fator não existia: as rotas `GET /auth/mfa/secret`,
 * `GET /auth/mfa/qr-code`, `POST /auth/mfa/enable` e `POST /auth/mfa/disable`
 * estavam prontas e sem nenhum chamador na web.
 *
 * O contrato que estes testes travam:
 * 1. o segredo vem do servidor — a tela nunca manda segredo para a API;
 * 2. ativar e desativar enviam `token` (o nome que o servidor valida), nunca `code`;
 * 3. desativar sem o código do autenticador não é oferecido.
 */

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    mfaNewSecret: vi.fn(),
    mfaQrCode: vi.fn(),
    mfaEnable: vi.fn(),
    mfaDisable: vi.fn(),
  },
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: apiMock };
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mfaNewSecret.mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/MeuFinanceiro:davi@ex.com?secret=JBSWY3DPEHPK3PXP',
  });
  apiMock.mfaQrCode.mockResolvedValue({
    otpauthUrl: 'otpauth://totp/MeuFinanceiro:davi@ex.com?secret=JBSWY3DPEHPK3PXP',
    qrCode: 'data:image/png;base64,AAAA',
  });
  apiMock.mfaEnable.mockResolvedValue({ mfaEnabled: true, user: { id: 'u-1' } });
  apiMock.mfaDisable.mockResolvedValue({ mfaEnabled: false, user: { id: 'u-1' } });
});

describe('MfaSetup', () => {
  it('pede o segredo ao servidor e mostra o QR code devolvido por ele', async () => {
    const user = userEvent.setup();
    render(<MfaSetup enabled={false} onChanged={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Ativar segundo fator' }));

    await waitFor(() => expect(apiMock.mfaNewSecret).toHaveBeenCalled());
    // O QR é do segredo pendente guardado no servidor: a tela não passa o
    // segredo que recebeu (ele não trafega de volta para a API).
    expect(apiMock.mfaQrCode).toHaveBeenCalledWith();
    const qr = await screen.findByAltText(/QR code/i);
    expect(qr.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(screen.getByLabelText(/Segredo para digitar/i).textContent).toBe('JBSWY3DPEHPK3PXP');
  });

  it('ativa o segundo fator mandando o código como `token`', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<MfaSetup enabled={false} onChanged={changed} />);

    await user.click(screen.getByRole('button', { name: 'Ativar segundo fator' }));
    const input = await screen.findByLabelText(/Código de 6 dígitos do app/i);
    await user.type(input, '123456');

    const confirm = screen.getByRole('button', { name: 'Confirmar e ativar' });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirm);

    await waitFor(() => expect(apiMock.mfaEnable).toHaveBeenCalledWith({ token: '123456' }));
    expect(changed).toHaveBeenCalledWith(true);
  });

  it('não confirma com menos de 6 dígitos', async () => {
    const user = userEvent.setup();
    render(<MfaSetup enabled={false} onChanged={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Ativar segundo fator' }));
    const input = await screen.findByLabelText(/Código de 6 dígitos do app/i);
    await user.type(input, '123');

    const confirm = screen.getByRole('button', { name: 'Confirmar e ativar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(apiMock.mfaEnable).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor quando o código é recusado', async () => {
    apiMock.mfaEnable.mockRejectedValue(new Error('Token TOTP inválido'));
    const user = userEvent.setup();
    render(<MfaSetup enabled={false} onChanged={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Ativar segundo fator' }));
    await user.type(await screen.findByLabelText(/Código de 6 dígitos do app/i), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmar e ativar' }));

    expect((await screen.findByText('Token TOTP inválido')).textContent).toContain('inválido');
  });

  it('com o segundo fator ativo, desativar exige o código do autenticador', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<MfaSetup enabled onChanged={changed} />);

    // Sem código não dá para desligar: é a primeira coisa que alguém com a
    // sessão sequestrada tentaria fazer.
    const disableButton = screen.getByRole('button', {
      name: 'Desativar segundo fator',
    }) as HTMLButtonElement;
    expect(disableButton.disabled).toBe(true);

    await user.type(screen.getByLabelText(/Código atual do app/i), '654321');
    await user.click(screen.getByRole('button', { name: 'Desativar segundo fator' }));

    await waitFor(() => expect(apiMock.mfaDisable).toHaveBeenCalledWith({ token: '654321' }));
    expect(changed).toHaveBeenCalledWith(false);
  });

  it('ativado, não oferece gerar um segredo novo', () => {
    render(<MfaSetup enabled onChanged={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Ativar segundo fator' })).toBeNull();
    expect(apiMock.mfaNewSecret).not.toHaveBeenCalled();
  });
});
