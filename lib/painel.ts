// Formato das linhas que o painel consome: os mesmos nomes de colunas do CSV de amostra do protótipo.
export type Periodo = "manha" | "tarde";

export type EdicaoResumo = { id: string; data: string; periodo: Periodo; status: string; gerada_em: string };

export type Linha = {
  linha_id: string;
  edicao_data: string;
  item_id: string;
  card_id: string;
  card: string;
  demanda: string;
  area: string;
  gestor: string;
  tier: string;
  grupo: string;
  empresa: string;
  campo_prazo: string;
  prazo: string;
  status: string;
  dias_atraso: number;
  situacao_fim_dia: string;
  fase: string;
  link: string;
};

export const ID_EDICAO = /^\d{4}-\d{2}-\d{2}-(manha|tarde)$/;

// Cor do pontinho de cada tier (painel e Radar); longe do âmbar e do ferrugem, que no painel são status.
// Tier sempre aparece com a sua cor.
export const COR_TIER: Record<string, string> = {
  Diamante: "#2EC4E6",
  Ouro: "#E3B341",
  Prata: "#AEB6BC",
  Bronze: "#B9825A",
  "Bronze(-)": "#D9B79A",
  RG: "#7E8C96",
  "Parceiros / Cortesia": "#C9A9D6",
};

/** Um ponto do gráfico de evolução: contagens de uma edição da manhã. */
export type PontoSerie = { id: string; data: string; vencidas: number; hoje: number; radar: number };
