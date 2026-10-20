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
