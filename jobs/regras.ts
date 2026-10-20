// Regras de prazo e status. Puro: sem I/O, sem relógio — "hoje" e as databases entram por parâmetro.
import { formatInTimeZone } from "date-fns-tz";
import {
  AREA_NOME,
  CAMPOS,
  CAMPOS_PRAZO,
  D_RADAR,
  FASES_EXCLUIDAS,
  FUSO,
  linkCard,
  type Area,
} from "./config";

/** Data de calendário em America/Sao_Paulo, "AAAA-MM-DD". */
export type Dia = string;

export type CampoCru = {
  value?: string | null;
  date_value?: string | null;
  datetime_value?: string | null;
  array_value?: string[] | null;
  connectedRepoItems?: { id: string; title: string }[] | null;
};

export type CardCru = {
  id: string;
  title: string;
  fase: { id: string; nome: string };
  campos: Record<string, CampoCru>;
};

export type Status = "Atrasado" | "Próximo do vencimento" | "No radar (até D+2)";

export type Gestor = { nome: string | null; email: string | null };

export type Item = {
  item_id: string;
  card_id: string;
  card: string;
  area: Area;
  demanda: string;
  empresa: string;
  grupo: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  campo_prazo: string;
  prazo: Dia;
  status: Status;
  dias_atraso: number;
  fase_id: string;
  fase_nome: string;
  link: string;
};

export class DataInvalida extends Error {
  constructor(
    readonly campo: string,
    readonly valor: string,
  ) {
    super(`Data inválida em ${campo}: ${JSON.stringify(valor)}`);
  }
}

// ---------- datas ----------

const BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

function montarDia(a: number, m: number, d: number): Dia | null {
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Converte um texto de data em dia de São Paulo.
 * Aceita dd/mm/aaaa [HH:MM[:SS]], AAAA-MM-DD [HH:MM[:SS]] (hora local) e ISO com fuso (convertido para SP).
 * Vazio → null. Formato irreconhecível → undefined.
 */
export function parseDia(texto: string | null | undefined): Dia | null | undefined {
  const s = texto?.trim();
  if (!s) return null;

  let m = BR.exec(s);
  if (m) return montarDia(+m[3], +m[2], +m[1]) ?? undefined;

  if (ISO_COM_FUSO.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : formatInTimeZone(t, FUSO, "yyyy-MM-dd");
  }

  m = ISO_LOCAL.exec(s);
  if (m) return montarDia(+m[1], +m[2], +m[3]) ?? undefined;

  return undefined;
}

/** Dia de um campo do Pipefy: datetime_value (UTC) > date_value > value. */
export function diaDoCampo(slug: string, c: CampoCru | undefined): Dia | null {
  if (!c) return null;
  let invalido: string | undefined;
  for (const v of [c.datetime_value, c.date_value, c.value]) {
    const dia = parseDia(v);
    if (dia) return dia;
    if (dia === undefined) invalido ??= String(v);
  }
  if (invalido !== undefined) throw new DataInvalida(slug, invalido);
  return null;
}

export function hojeEmSP(agora: Date): Dia {
  return formatInTimeZone(agora, FUSO, "yyyy-MM-dd");
}

const utc = (d: Dia) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** b − a em dias de calendário. */
export const diasEntre = (a: Dia, b: Dia) => Math.round((utc(b) - utc(a)) / 864e5);

export function somarDias(d: Dia, n: number): Dia {
  return new Date(utc(d) + n * 864e5).toISOString().slice(0, 10);
}

// ---------- prazo por área ----------

export function preenchido(c: CampoCru | undefined): boolean {
  if (!c) return false;
  if (c.array_value) return c.array_value.length > 0;
  const v = c.value?.trim();
  return !!v && v !== "[]";
}

export type Prazo = { prazo: Dia; campo: string };

/** MAX que ignora vazios; empate fica com o primeiro campo da lista. */
function maior(card: CardCru, slugs: readonly string[]): Prazo | null {
  let melhor: Prazo | null = null;
  for (const slug of slugs) {
    const dia = diaDoCampo(slug, card.campos[slug]);
    if (dia && (!melhor || dia > melhor.prazo)) melhor = { prazo: dia, campo: slug };
  }
  return melhor;
}

export function prazoDaArea(card: CardCru, area: Area): Prazo | null {
  if (area === "ST") return maior(card, CAMPOS_PRAZO.ST);
  if (area === "OG") return maior(card, CAMPOS_PRAZO.OG);

  const { relatorioAnualOculto, prazoRelatorioAnual, demais } = CAMPOS_PRAZO.SO;
  // Igual à DAX: se o "Oculto" estiver marcado, vale o Prazo Relatório Anual mesmo vazio.
  if (preenchido(card.campos[relatorioAnualOculto]) || preenchido(card.campos[prazoRelatorioAnual])) {
    return maior(card, [prazoRelatorioAnual]);
  }
  return maior(card, demais);
}

// ---------- status ----------

export function statusDoPrazo(prazo: Dia, hoje: Dia): { status: Status; dias_atraso: number } | null {
  const d = diasEntre(hoje, prazo);
  if (d < 0) return { status: "Atrasado", dias_atraso: -d };
  if (d === 0) return { status: "Próximo do vencimento", dias_atraso: 0 };
  if (d <= D_RADAR) return { status: "No radar (até D+2)", dias_atraso: 0 };
  return null;
}

export const faseMonitorada = (faseId: string) => !(faseId in FASES_EXCLUIDAS);

// ---------- gestor ----------

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

export type Databases = {
  /** Equipe Comercial: id do registro → gestor */
  gestorPorRegistro: Map<string, Gestor>;
  /** Equipe Comercial: nome normalizado → gestor */
  gestorPorNome: Map<string, Gestor>;
  /** DB - BR NET: empresa_name normalizado → account_coordinator_name */
  coordenadorPorEmpresa: Map<string, string>;
  /** DB - BR NET: group_name normalizado → account_coordinator_name */
  coordenadorPorGrupo: Map<string, string>;
};

function nomesDoConector(c: CampoCru | undefined): string[] {
  if (c?.connectedRepoItems?.length) return c.connectedRepoItems.map((x) => x.title);
  try {
    const v = JSON.parse(c?.value ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return c?.value ? [c.value] : [];
  }
}

/** Gestor do card; se o card não traz, procura a empresa e depois o grupo na DB - BR NET. */
export function resolverGestor(card: CardCru, db: Databases, empresa: string, grupo: string): Gestor {
  const campo = card.campos[CAMPOS.gestor];
  const reg = campo?.connectedRepoItems?.[0];
  if (reg && db.gestorPorRegistro.has(reg.id)) return db.gestorPorRegistro.get(reg.id)!;

  const nome =
    nomesDoConector(campo)[0]?.trim() ||
    db.coordenadorPorEmpresa.get(normalizar(empresa)) ||
    db.coordenadorPorGrupo.get(normalizar(grupo)) ||
    null;
  if (!nome) return { nome: null, email: null };
  return db.gestorPorNome.get(normalizar(nome)) ?? { nome, email: null };
}

// ---------- item ----------

const texto = (c: CampoCru | undefined) => c?.value?.trim() ?? "";

export const DEMANDA_SEM_TIPO = "Sem tipo de documento";

/** Itens de um card na data `hoje` (até um por área). Lança DataInvalida se um campo de prazo não for data. */
export function itensDoCard(card: CardCru, hoje: Dia, db: Databases): Item[] {
  if (!faseMonitorada(card.fase.id)) return [];

  const empresa = texto(card.campos[CAMPOS.empresa]);
  const grupo = texto(card.campos[CAMPOS.grupo]);
  const demanda = texto(card.campos[CAMPOS.demanda]) || DEMANDA_SEM_TIPO;
  let gestor: Gestor | undefined;

  const itens: Item[] = [];
  for (const area of Object.keys(AREA_NOME) as Area[]) {
    const p = prazoDaArea(card, area);
    if (!p) continue;
    const s = statusDoPrazo(p.prazo, hoje);
    if (!s) continue;
    gestor ??= resolverGestor(card, db, empresa, grupo);
    itens.push({
      item_id: `${card.id}-${area}`,
      card_id: card.id,
      card: card.title,
      area,
      demanda,
      empresa,
      grupo,
      gestor_nome: gestor.nome,
      gestor_email: gestor.email,
      campo_prazo: p.campo,
      prazo: p.prazo,
      ...s,
      fase_id: card.fase.id,
      fase_nome: card.fase.nome,
      link: linkCard(card.id),
    });
  }
  return itens;
}
