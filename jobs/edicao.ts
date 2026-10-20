// Monta a edição a partir dos cards. A comparação manhã × tarde entra na etapa 4.
import type { Periodo } from "./config";
import type { Aviso } from "./pipefy";
import { DataInvalida, itensDoCard, type CardCru, type Databases, type Dia, type Item, type Status } from "./regras";

export type Situacao = "Concluído hoje" | "Pendente";
export type ItemEdicao = Item & { situacao_fim_dia: Situacao | null };

export function gerarItens(cards: CardCru[], hoje: Dia, db: Databases, avisos: Aviso[]): ItemEdicao[] {
  const itens: ItemEdicao[] = [];
  for (const card of cards) {
    try {
      for (const it of itensDoCard(card, hoje, db)) itens.push({ ...it, situacao_fim_dia: null });
    } catch (e) {
      if (!(e instanceof DataInvalida)) throw e;
      avisos.push({ card_id: card.id, motivo: e.message });
    }
  }
  return itens;
}

const ORDEM: Record<Status, number> = { Atrasado: 0, "Próximo do vencimento": 1, "No radar (até D+2)": 2 };

/** Mesma ordem do painel: status, mais dias de atraso, prazo mais cedo. */
export const porUrgencia = (a: Item, b: Item) =>
  ORDEM[a.status] - ORDEM[b.status] || b.dias_atraso - a.dias_atraso || a.prazo.localeCompare(b.prazo);

export type Carteira = { nome: string; email: string | null; itens: ItemEdicao[] };

/** Agrupa por gestor (e-mail quando houver, senão nome). Itens sem gestor ficam em "Sem gestor". */
export function carteiras(itens: ItemEdicao[]): Carteira[] {
  const m = new Map<string, Carteira>();
  for (const it of itens) {
    const chave = it.gestor_email ?? `nome:${it.gestor_nome ?? ""}`;
    const c = m.get(chave) ?? { nome: it.gestor_nome ?? "Sem gestor", email: it.gestor_email, itens: [] };
    c.itens.push(it);
    m.set(chave, c);
  }
  return [...m.values()].sort((a, b) => b.itens.length - a.itens.length);
}

export type Numeros = { vencidas: number; hoje: number; radar: number; concluidas: number; viramAtraso: number; atrasadasAbertas: number };

export function numeros(itens: ItemEdicao[]): Numeros {
  const conta = (f: (i: ItemEdicao) => boolean) => itens.filter(f).length;
  const aberto = (i: ItemEdicao) => i.situacao_fim_dia !== "Concluído hoje";
  return {
    vencidas: conta((i) => i.status === "Atrasado"),
    hoje: conta((i) => i.status === "Próximo do vencimento"),
    radar: conta((i) => i.status === "No radar (até D+2)"),
    concluidas: conta((i) => i.situacao_fim_dia === "Concluído hoje"),
    viramAtraso: conta((i) => i.status === "Próximo do vencimento" && aberto(i)),
    atrasadasAbertas: conta((i) => i.status === "Atrasado" && aberto(i)),
  };
}

export const idEdicao = (data: Dia, periodo: Periodo) => `${data}-${periodo}`;
