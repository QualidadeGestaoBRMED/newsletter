// Tudo que identifica o pipe, os campos e os horários fica aqui.
// IDs confirmados no Pipefy em 2026-10-20 (MCP + respostas do time). O que ainda falta está marcado com TODO.

export const FUSO = "America/Sao_Paulo";

export const PIPEFY_URL = "https://api.pipefy.com/graphql";
export const PIPE_ID = "302370343";

// Fases que não entram na edição.
export const FASES_EXCLUIDAS: Record<string, string> = {
  "315003811": "ARQUIVO",
  "322203966": "ARQUIVO MORTO",
  // Fases de conclusão, excluídas por decisão do Suporte (2026-10-20)
  "315003828": "Demanda Finalizada Cliente",
  "315982213": "Demanda Interna Finalizada",
  "315003805": "Concluído (Manutenção BR NET)",
  "315003817": "Proposta Não Aceita pelo Cliente",
};

export type Area = "ST" | "SO" | "OG";

export const AREA_NOME: Record<Area, string> = {
  ST: "Segurança",
  SO: "Saúde",
  OG: "On-Going",
};

// Campos de prazo por área, conforme as medidas DAX do Power BI.
export const CAMPOS_PRAZO = {
  // prazo_ST = MAX(Prazo de entrega documento final, Prazo Segurança do Trabalho).
  // "Prazo Segurança do Trabalho (ST)" (prazo_seguran_a_do_trabalho_st) não entra, confirmado pelo Suporte.
  ST:["prazo_de_entrega_p_s_visita", "prazo_seguran_a_do_trabalho"],
  SO: {
    // SE (Relatório Anual (Oculto) preenchido) OU (Prazo Relatório Anual preenchido) → Prazo Relatório Anual
    relatorioAnualOculto: "relat_rio_anual_oculto",
    prazoRelatorioAnual: "prazo_relat_rio_anual_1",
    // SENÃO → MAX(Prazo Saúde Ocupacional, Prazo (SO))
    // TODO: confirmar se "Prazo (SO)" do Power BI é `prazo_so` (due_date da Triagem SO) ou
    // `prazo_de_entrega_sa_de` ("Prazo de entrega (Saúde)", fase Aguardando Relatórios) — o comentário da DAX cita este.
    demais: ["prazo_sa_de_ocupacional", "prazo_so"],
  },
  OG: ["prazo_manuten_o_br_net", "prazo_manuten_o_br_net_op"],
} as const;

export const CAMPOS = {
  empresa: "nome_da_empresa_conforme_br_net",
  grupo: "grupo_econ_mico_conforme_br_net",
  // Conector para a database "Equipe Comercial" (nome + e-mail)
  gestor: "informar_o_respons_vel_pela_sua_conta_na_br_med_restored",
  demanda: "tipo_de_documento",
} as const;

// Databases do Pipefy usadas para resolver o gestor
export const TABELAS = {
  // Gestor da conta (Suporte): nome e e-mail. É a database ligada ao campo CAMPOS.gestor.
  gestores: { id: "301811379", nome: "nome", email: "e_mail" },
  // DB - BR NET: empresa/grupo → gestor. Reserva quando o card não traz o gestor.
  brnet: {
    id: "304272431",
    empresa: "empresa_name",
    grupo: "group_name",
    gestor: "account_coordinator_name",
  },
} as const;

export const linkCard = (cardId: string) => `https://app.pipefy.com/open-cards/${cardId}`;

// Janela da edição: vencidos, hoje e até hoje + D_RADAR dias
export const D_RADAR = 2;

export type Periodo = "manha" | "tarde";

export const HORARIO: Record<Periodo, string> = {
  manha: "07:00",
  tarde: "18:00", // TODO: confirmar o horário da edição de fim do dia
};

// TODO: gestores sem itens recebem e-mail? Por enquanto não.
export const ENVIAR_SEM_ITENS = false;

// TODO: rodar em feriados? O cron do Actions só filtra seg–sex.
export const FERIADOS: string[] = [];
