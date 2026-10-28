// Radar de clientes: formato dos sinais que a tela consome e regras puras usadas pelo job e pela tela.

export type Prioridade = "agir" | "acompanhar" | "contexto";

/** O Radar cobre só os clientes Diamante e Ouro: o job não coleta os demais e a tela não os mostra. */
export const TIERS_RADAR = ["Diamante", "Ouro"];
export const noRadar = (tier: string | null) => !!tier && TIERS_RADAR.includes(tier);

export const TIPOS_SINAL = [
  "expansao",
  "nova_unidade",
  "contrato",
  "contratacao",
  "desmobilizacao",
  "acidente_fiscalizacao",
  "fusao_aquisicao",
  "troca_decisor",
  "seguranca_saude",
  "outro",
] as const;
export type TipoSinal = (typeof TIPOS_SINAL)[number];

/** Uma publicação que sustenta o sinal. `data` em AAAA-MM-DD quando a fonte informa. */
export type FonteSinal = { veiculo: string; titulo: string; url: string; data: string | null };

export type Sinal = {
  id: string;
  grupo: string;
  tier: string | null;
  gestor: string | null;
  titulo: string;
  resumo: string;
  proximo_passo: string;
  tipo: TipoSinal;
  prioridade: Prioridade;
  publicado_em: string | null;
  coletado_em: string; // ISO
  fontes: FonteSinal[];
};

export type Periodo = "hoje" | "ontem" | "semana" | "antes";
export const PERIODOS: [Periodo, string][] = [
  ["hoje", "Hoje"],
  ["ontem", "Ontem"],
  ["semana", "Esta semana"],
  ["antes", "Anteriores"],
];

const diaUTC = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

/** Em qual seção do jornal o sinal entra, pela data da publicação (ou da coleta, se a fonte não tem data). */
export function periodoDe(s: Pick<Sinal, "publicado_em" | "coletado_em">, hoje: string): Periodo {
  const d = (s.publicado_em ?? s.coletado_em).slice(0, 10);
  const dias = Math.round((diaUTC(hoje) - diaUTC(d)) / 864e5);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return "semana";
  return "antes";
}

const PESO: Record<Prioridade, number> = { agir: 0, acompanhar: 1, contexto: 2 };

/** Ordem do jornal: prioridade, depois tier (na régua dada), depois o mais recente. */
export function ordenarSinais(v: Sinal[], tiers: readonly string[]): Sinal[] {
  const t = (x: string | null) => (x && tiers.includes(x) ? tiers.indexOf(x) : tiers.length);
  const quando = (s: Sinal) => s.publicado_em ?? s.coletado_em.slice(0, 10);
  return v
    .slice()
    .sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade] || t(a.tier) - t(b.tier) || quando(b).localeCompare(quando(a)));
}

/** A manchete: o sinal "agir" mais forte dos últimos 7 dias; senão, o mais forte de todos. */
export function manchete(v: Sinal[], tiers: readonly string[], hoje: string): Sinal | null {
  const ord = ordenarSinais(
    v.filter((s) => s.prioridade !== "contexto"),
    tiers,
  );
  return ord.find((s) => s.prioridade === "agir" && periodoDe(s, hoje) !== "antes") ?? ord[0] ?? null;
}
