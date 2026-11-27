/**
 * A voz do produto.
 *
 * O painel sabia dizer números, mas não dizia nada sozinho: abrir o app dava um
 * "Olá" fixo e uma descrição genérica, iguais às 3 da manhã e às 9 da noite, com
 * dinheiro sobrando ou faltando. Aqui ficam as frases que dão personalidade —
 * em função pura, para serem testáveis sem montar a tela.
 */

export type Mood = 'positive' | 'negative' | 'neutral';

export type Headline = {
  tone: Mood;
  title: string;
  detail: string;
};

/**
 * Hora local do navegador.
 *
 * Fora de função de render pura porque `new Date()` no corpo do componente
 * quebra o render no servidor: o HTML de lá sairia "Bom dia" e o da hidratação
 * "Boa noite". Fica isolado num ponto só para o teste poder cravar a hora.
 */
export function hourOfDay(): number {
  return new Date().getHours();
}

/** Cumprimento pelo relógio local do usuário. */
export function greetingFor(hour: number): string {
  if (!Number.isFinite(hour)) return 'Olá';
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome, sem tratar e-mail como nome. */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first || 'por aqui';
}

function percent(value: number): string {
  return `${Math.max(0, Math.round(value))}%`;
}

/**
 * A frase do mês, na primeira pessoa do plural — é um app de casal.
 *
 * `savingsRate` é `null` quando não entrou nada: aí não faz sentido falar de
 * porcentagem, porque qualquer divisão por zero viraria número inventado.
 */
export function monthHeadline(input: {
  monthLabel: string;
  incomeCents: bigint;
  expenseCents: bigint;
  savingsRate: number | null;
  pendingCount: number;
}): Headline {
  const { monthLabel, incomeCents, expenseCents, savingsRate, pendingCount } = input;

  if (incomeCents === 0n && expenseCents === 0n) {
    return {
      tone: 'neutral',
      title: `${monthLabel} ainda está em branco`,
      detail: 'Nenhum lançamento no mês. Registre o primeiro para ver o retrato do casal.',
    };
  }

  const netCents = incomeCents - expenseCents;
  const pending =
    pendingCount > 0
      ? ` ${pendingCount} lançamento${pendingCount > 1 ? 's' : ''} ainda ${
          pendingCount > 1 ? 'estão' : 'está'
        } pendente${pendingCount > 1 ? 's' : ''}.`
      : '';

  if (netCents > 0n) {
    const rate = savingsRate === null ? null : percent(savingsRate);
    return {
      tone: 'positive',
      title: rate
        ? `${monthLabel} fechou no azul: sobrou ${rate} do que entrou`
        : `${monthLabel} fechou no azul`,
      detail:
        rate === null
          ? `Sobrou dinheiro no mês.${pending}`
          : `Sobrou dinheiro no mês — ${rate} de tudo que entrou ficou com vocês.${pending}`,
    };
  }

  if (netCents < 0n) {
    return {
      tone: 'negative',
      title: `${monthLabel} saiu mais do que entrou`,
      detail: `As despesas passaram das receitas. Vale olhar as categorias que mais pesaram.${pending}`,
    };
  }

  return {
    tone: 'neutral',
    title: `${monthLabel} empatou no zero a zero`,
    detail: `Entrou exatamente o que saiu.${pending}`,
  };
}

/** Texto curto para o rodapé da barra lateral: em que pé está a sessão. */
export function sessionLabel(mode: 'demo' | 'api'): { text: string; live: boolean } {
  return mode === 'api'
    ? { text: 'Conectado à sua conta', live: true }
    : { text: 'Modo demonstração', live: false };
}
