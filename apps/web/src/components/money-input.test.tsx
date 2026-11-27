import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MoneyInput } from './money-input';

/** Wrapper controlado: o componente é sempre usado dentro de um formulário. */
function Controlled({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MoneyInput label="Saldo atual" onChange={setValue} value={value} />;
}

describe('MoneyInput', () => {
  it('mostra o valor em reais ao lado do campo, para não salvar 7452 por engano', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Saldo atual');

    await userEvent.type(input, '7452');

    // Máscara de centavos: cada dígito entra pela direita.
    expect((input as HTMLInputElement).value).toBe('74,52');
    expect(screen.getByText('R$ 74,52')).toBeTruthy();
  });

  it('aceita vírgula e formata milhares na prévia', () => {
    render(<Controlled initial="1.234,56" />);

    expect(screen.getByLabelText('Saldo atual')).toHaveProperty('value', '1.234,56');
    expect(screen.getByText('R$ 1.234,56')).toBeTruthy();
  });

  it('colar um valor inteiro longo vira reais com centavos', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Saldo atual');

    await userEvent.type(input, '123456');

    expect((input as HTMLInputElement).value).toBe('1.234,56');
  });

  it('backspace apaga um dígito do valor, não a vírgula', async () => {
    render(<Controlled initial="1.234,56" />);
    const input = screen.getByLabelText('Saldo atual');

    await userEvent.type(input, '{Backspace}');

    expect((input as HTMLInputElement).value).toBe('123,45');
  });

  it('mantém o sinal negativo da fatura do cartão', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Saldo atual');

    await userEvent.type(input, '-15000');

    expect((input as HTMLInputElement).value).toBe('-150,00');
    expect(screen.getByText('-R$ 150,00')).toBeTruthy();
  });

  it('explica o formato quando o campo está vazio', () => {
    render(<Controlled />);

    expect(screen.getByText(/Digite só os números/)).toBeTruthy();
  });

  it('descarta letras coladas no campo', async () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Saldo atual');

    await userEvent.type(input, 'abc1250');

    expect((input as HTMLInputElement).value).toBe('12,50');
  });

  it('dispara onEnter sem submeter o formulário por acidente', async () => {
    const onEnter = vi.fn();
    function WithEnter() {
      const [value, setValue] = useState('');
      return <MoneyInput label="Limite" onChange={setValue} onEnter={onEnter} value={value} />;
    }
    render(<WithEnter />);

    await userEvent.type(screen.getByLabelText('Limite'), '100{Enter}');

    expect(onEnter).toHaveBeenCalled();
  });
});
