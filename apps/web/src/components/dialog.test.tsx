import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider, Select, useDialog } from '@/components/dialog';
import { DateField } from '@/components/date-field';

function SelectHarness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      label="Categoria do orçamento"
      onChange={setValue}
      options={[
        { value: 'food', label: 'Alimentação', color: '#EF4444' },
        { value: 'home', label: 'Moradia', hint: 'já tem limite' },
      ]}
      placeholder="Escolha uma categoria…"
      value={value}
    />
  );
}

function DialogHarness({ onResult }: { onResult: (value: boolean) => void }) {
  const dialog = useDialog();
  return (
    <button
      onClick={async () => {
        const confirmed = await dialog.confirm({
          title: 'Excluir “Assinaturas”?',
          description: 'Os lançamentos ficam sem categoria.',
          confirmLabel: 'Excluir categoria',
        });
        onResult(confirmed);
      }}
      type="button"
    >
      pedir confirmação
    </button>
  );
}

function DateHarness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField label="Data do lançamento" max="2026-11-25" onChange={setValue} value={value} />
  );
}

describe('Select próprio', () => {
  it('abre o menu no clique e troca a opção sem usar select nativo', async () => {
    const user = userEvent.setup();
    const { container } = render(<SelectHarness />);

    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByRole('button', { name: 'Categoria do orçamento' }).textContent).toContain(
      'Escolha uma categoria'
    );

    await user.click(screen.getByRole('button', { name: 'Categoria do orçamento' }));
    expect(screen.getByRole('listbox', { name: 'Categoria do orçamento' })).toBeTruthy();

    await user.click(screen.getByRole('option', { name: /Moradia/ }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Categoria do orçamento' }).textContent).toContain(
      'Moradia'
    );
  });

  it('navega e escolhe com o teclado', async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);

    const trigger = screen.getByRole('button', { name: 'Categoria do orçamento' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => expect(trigger.textContent).toContain('Moradia'));
  });
});

describe('Confirmação própria', () => {
  it('resolve com true ao confirmar e com false ao cancelar', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <DialogProvider>
        <DialogHarness onResult={onResult} />
      </DialogProvider>
    );

    await user.click(screen.getByRole('button', { name: 'pedir confirmação' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Excluir “Assinaturas”?');
    await user.click(screen.getByRole('button', { name: 'Excluir categoria' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));

    await user.click(screen.getByRole('button', { name: 'pedir confirmação' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });
});

describe('Campo de data próprio', () => {
  it('mostra o calendário e escolhe um dia sem input nativo', async () => {
    const user = userEvent.setup();
    const { container } = render(<DateHarness initial="2026-11-10" />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Data do lançamento' });
    expect(trigger.textContent).toContain('10 de novembro de 2026');

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '20 de novembro de 2026' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger.textContent).toContain('20 de novembro de 2026');
  });

  it('desabilita dias depois do limite máximo', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-10-30" />);

    await user.click(screen.getByRole('button', { name: 'Data do lançamento' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));

    const future = screen.getByRole('button', {
      name: '10 de dezembro de 2026',
    }) as HTMLButtonElement;
    expect(future.disabled).toBe(true);
  });
});

/**
 * `dialog.prompt` — substitui `window.prompt` (usado na tela de patrimônio
 * para alterar o valor de um bem). `window.prompt` é bloqueante, sem estilo e
 * sem validação visível.
 */
function PromptHarness({ onResult }: { onResult: (value: string | null) => void }) {
  const dialog = useDialog();
  return (
    <button
      onClick={async () => {
        const value = await dialog.prompt({
          title: 'Novo valor de “Carro”',
          label: 'Valor (R$)',
          defaultValue: '1.234,56',
          inputMode: 'decimal',
          confirmLabel: 'Salvar valor',
        });
        onResult(value);
      }}
      type="button"
    >
      pedir valor
    </button>
  );
}

describe('dialog.prompt', () => {
  it('devolve o texto digitado ao salvar', async () => {
    const results: Array<string | null> = [];
    render(
      <DialogProvider>
        <PromptHarness onResult={(value) => results.push(value)} />
      </DialogProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'pedir valor' }));
    const input = await screen.findByLabelText('Valor (R$)');
    // O valor atual vem preenchido, para a pessoa ajustar em vez de digitar tudo.
    expect((input as HTMLInputElement).value).toBe('1.234,56');

    await userEvent.clear(input);
    await userEvent.type(input, '2.000,00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar valor' }));

    await waitFor(() => expect(results).toEqual(['2.000,00']));
  });

  it('devolve null ao cancelar (mesmo contrato do window.prompt)', async () => {
    const results: Array<string | null> = [];
    render(
      <DialogProvider>
        <PromptHarness onResult={(value) => results.push(value)} />
      </DialogProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'pedir valor' }));
    await screen.findByLabelText('Valor (R$)');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(results).toEqual([null]));
  });

  it('não deixa salvar com o campo vazio', async () => {
    render(
      <DialogProvider>
        <PromptHarness onResult={() => undefined} />
      </DialogProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'pedir valor' }));
    const input = await screen.findByLabelText('Valor (R$)');
    await userEvent.clear(input);

    expect(
      (screen.getByRole('button', { name: 'Salvar valor' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('envia o valor no Enter, sem precisar do botão', async () => {
    const results: Array<string | null> = [];
    render(
      <DialogProvider>
        <PromptHarness onResult={(value) => results.push(value)} />
      </DialogProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'pedir valor' }));
    const input = await screen.findByLabelText('Valor (R$)');
    await userEvent.clear(input);
    await userEvent.type(input, '99,90{Enter}');

    await waitFor(() => expect(results).toEqual(['99,90']));
  });
});
