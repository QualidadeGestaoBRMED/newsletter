// Regras de prazo e status. Puro: sem I/O, sem relógio — "hoje" e as databases entram por parâmetro.
import { formatInTimeZone } from "date-fns-tz";
import {
  AREA_NOME,
  CAMPOS,
  CAMPOS_PRAZO,
  D_RADAR,
  FASE_FIM_AREA,
  FASES_EXCLUIDAS,
  FERIADOS,
  FUSO,
  TITULO_EXCLUIDO,
  TITULO_RASCUNHO,
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
  /** Ids das fases por onde o card já passou (phases_history) */
  fasesPassadas?: string[];
  /** Dia de criação do card (createdAt, no fuso de São Paulo) */
  criadoEm?: Dia;
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
  tier: string | null;
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

export const diaUtil = (d: Dia) => { const s = new Date(utc(d)).getUTCDay(); return s !== 0 && s !== 6 && !FERIADOS.includes(d); };

/** Dias úteis de a (exclusive) até b (inclusive), para b ≥ a. */
export function diasUteisAte(a: Dia, b: Dia): number {
  let n = 0;
  for (let d = somarDias(a, 1); d <= b; d = somarDias(d, 1)) if (diaUtil(d)) n++;
  return n;
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
  // Igual à DAX: com o "Oculto" marcado vale o Prazo Relatório Anual (o maior dos dois campos), mesmo vazio.
  if (preenchido(card.campos[relatorioAnualOculto])) return maior(card, prazoRelatorioAnual);
  return maior(card, demais);
}

// ---------- status ----------

// O radar conta dias úteis (revisão de 23/10/2026). Os dias de atraso seguem em dias corridos.
// TODO: confirmar se os dias de atraso também passam a contar em dias úteis, e o calendário de feriados.
export function statusDoPrazo(prazo: Dia, hoje: Dia): { status: Status; dias_atraso: number } | null {
  const d = diasEntre(hoje, prazo);
  if (d < 0) return { status: "Atrasado", dias_atraso: -d };
  if (d === 0) return { status: "Próximo do vencimento", dias_atraso: 0 };
  if (diasUteisAte(hoje, prazo) <= D_RADAR) return { status: "No radar (até D+2)", dias_atraso: 0 };
  return null;
}

export const faseMonitorada = (faseId: string) => !(faseId in FASES_EXCLUIDAS);

/** Card de teste: "teste" como palavra no título, na empresa ou no grupo. */
export const cardDeTeste = (...textos: string[]) => textos.some((t) => /\btestes?\b/.test(normalizar(t)));

/** Card que não entra, em qualquer fase: Notify, sem Tipo de documento, de alteração de prazo (demandas internas) ou Rascunho. */
export function cardExcluido(card: CardCru): boolean {
  const titulo = normalizar(card.title);
  return (
    CAMPOS.notify.some((s) => preenchido(card.campos[s])) ||
    !texto(card.campos[CAMPOS.demanda]) ||
    titulo.includes(TITULO_EXCLUIDO) ||
    titulo === TITULO_RASCUNHO
  );
}

/** A área já finalizou a demanda: o card passou (ou está) na fase que encerra a área. */
export const areaFinalizada = (card: CardCru, area: Area) => card.fase.id === FASE_FIM_AREA[area] || !!card.fasesPassadas?.includes(FASE_FIM_AREA[area]);

// ---------- gestor ----------

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Registro da DB - BR NET ligado ao card pelo conector da empresa */
export type RegistroBrnet = { empresa: string; grupo: string; coordenador: string | null; tier: string | null };

export type Databases = {
  /** DB - BR NET: id do registro → empresa, grupo, gestor e tier */
  brnetPorRegistro?: Map<string, RegistroBrnet>;
  /** Equipe Comercial: id do registro → gestor */
  gestorPorRegistro: Map<string, Gestor>;
  /** Equipe Comercial: nome normalizado → gestor */
  gestorPorNome: Map<string, Gestor>;
  /** DB - BR NET: empresa_name normalizado → account_coordinator_name */
  coordenadorPorEmpresa: Map<string, string>;
  /** DB - BR NET: group_name normalizado → account_coordinator_name */
  coordenadorPorGrupo: Map<string, string>;
  /** DB - BR NET: empresa_name normalizado → tier */
  tierPorEmpresa: Map<string, string>;
  /** DB - BR NET: group_name normalizado → tier mais frequente do grupo */
  tierPorGrupo: Map<string, string>;
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

/** Id do registro da DB - BR NET ligado ao card (primeiro conector de empresa preenchido). */
export const idRegistroBrnet = (card: CardCru) => CAMPOS.empresaBrnet.map((s) => card.campos[s]?.connectedRepoItems?.[0]?.id).find(Boolean) ?? null;

const registroDoCard = (card: CardCru, db: Databases) => { const id = idRegistroBrnet(card); return id ? db.brnetPorRegistro?.get(id) : undefined; };

/** Empresa e grupo: o empresa_name/group_name do registro da DB - BR NET; sem registro, os campos de texto do card. */
export function empresaDoCard(card: CardCru, db: Databases): { empresa: string; grupo: string } {
  const reg = registroDoCard(card, db);
  return { empresa: reg?.empresa || texto(card.campos[CAMPOS.empresa]), grupo: reg?.grupo || texto(card.campos[CAMPOS.grupo]) };
}

/** Gestor: primeiro a DB - BR NET (registro do card, depois empresa, depois grupo); só sem ela, o conector da Equipe Comercial do card. */
export function resolverGestor(card: CardCru, db: Databases, empresa: string, grupo: string): Gestor {
  const doBrnet = registroDoCard(card, db)?.coordenador || db.coordenadorPorEmpresa.get(normalizar(empresa)) || db.coordenadorPorGrupo.get(normalizar(grupo));
  if (doBrnet) return db.gestorPorNome.get(normalizar(doBrnet)) ?? { nome: doBrnet, email: null };

  const campo = card.campos[CAMPOS.gestor];
  const reg = campo?.connectedRepoItems?.[0];
  if (reg && db.gestorPorRegistro.has(reg.id)) return db.gestorPorRegistro.get(reg.id)!;
  const nome = nomesDoConector(campo)[0]?.trim();
  if (!nome) return { nome: null, email: null };
  return db.gestorPorNome.get(normalizar(nome)) ?? { nome, email: null };
}

const texto = (c: CampoCru | undefined) => c?.value?.trim() ?? "";

/** Tier: o da DB - BR NET (registro do card, depois empresa, depois grupo); se ela não tiver, os campos [NEW] do card. */
export function resolverTier(card: CardCru, db: Databases, empresa: string, grupo: string): string | null {
  return (
    registroDoCard(card, db)?.tier ||
    db.tierPorEmpresa.get(normalizar(empresa)) ||
    db.tierPorGrupo.get(normalizar(grupo)) ||
    CAMPOS.tier.map((s) => texto(card.campos[s])).find(Boolean) ||
    null
  );
}

// ---------- item ----------

export const DEMANDA_SEM_TIPO = "Sem tipo de documento";

/** Itens de um card na data `hoje` (até um por área). Lança DataInvalida se um campo de prazo não for data. */
export function itensDoCard(card: CardCru, hoje: Dia, db: Databases): Item[] {
  if (!faseMonitorada(card.fase.id) || cardExcluido(card)) return [];

  const { empresa, grupo } = empresaDoCard(card, db);
  if ((!empresa && !grupo) || cardDeTeste(card.title, empresa, grupo)) return [];
  const demanda = texto(card.campos[CAMPOS.demanda]) || DEMANDA_SEM_TIPO;
  let gestor: Gestor | undefined;
  let tier: string | null | undefined;

  const itens: Item[] = [];
  for (const area of Object.keys(AREA_NOME) as Area[]) {
    if (areaFinalizada(card, area)) continue;
    const p = prazoDaArea(card, area);
    // prazo anterior à criação do card é erro de preenchimento
    if (!p || (card.criadoEm && p.prazo < card.criadoEm)) continue;
    const s = statusDoPrazo(p.prazo, hoje);
    if (!s) continue;
    gestor ??= resolverGestor(card, db, empresa, grupo);
    if (tier === undefined) tier = resolverTier(card, db, empresa, grupo);
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
      tier,
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
