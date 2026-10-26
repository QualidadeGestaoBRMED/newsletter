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
  // Revisão de 23/10/2026 (time de Pipefy e BI)
  "329680114": "Análise do Suporte", // card já finalizado
  "343120238": "Controle de Vigência e Serviços SMS", // card já finalizado
  "323232905": "Aguardando retorno de Credenciados/Suprimentos/Filais", // sem relação com as áreas técnicas de SST
  "315003833": "Esclarecimento de Riscos", // demanda interna
  "315003834": "Esclarecimento de Exames", // demanda interna
  "315621777": "Cadastro de Função/Outros Serviços (Manut. BR NET)", // demanda interna
  "316631510": "Cadastro de Serviço e Exames", // demanda interna
  // Revisão de 26/10/2026
  "343155906": "Pendência - ROADMAP", // cards de NR1 tratados à parte pelo Suporte
};

// Fase que encerra a demanda de cada área: card que já passou por ela não gera item daquela área.
export const FASE_FIM_AREA: Record<Area, string> = {
  ST: "315003823", // Enviar Demandas para a Próxima Área (Segurança do Trabalho)
  SO: "315003804", // Enviar Demanda para Próxima área (Saúde Ocupacional)
  OG: "315003805", // Concluído (Manutenção BR NET)
};

export type Area = "ST" | "SO" | "OG";

export const AREA_NOME: Record<Area, string> = {
  ST: "Segurança",
  SO: "Saúde",
  OG: "On-Going",
};

// Campos de prazo por área, conforme as medidas DAX do Power BI e a revisão de 23/10/2026.
export const CAMPOS_PRAZO = {
  // prazo_ST = MAX(Prazo de entrega documento final, Prazo Segurança do Trabalho).
  // "Prazo Segurança do Trabalho (ST)" (prazo_seguran_a_do_trabalho_st) também está na DAX, mas o fluxo não existe e o campo nunca é preenchido.
  ST: ["prazo_de_entrega_p_s_visita", "prazo_seguran_a_do_trabalho"],
  SO: {
    // Relatório Anual (Oculto) marcado → MAX dos dois campos "Prazo Relatório Anual"
    relatorioAnualOculto: "relat_rio_anual_oculto",
    prazoRelatorioAnual: ["prazo_relat_rio_anual_1", "prazo_relat_rio_anual"],
    // senão → só o Prazo Saúde Ocupacional da Análise Contratual (Prazo (SO) é cópia dele por automação)
    demais: ["prazo_sa_de_ocupacional"],
  },
  // Só o "(OP)" da Triagem Técnica (Manut.BR NET); o homônimo da fase Proposta Aceita não entra
  OG: ["prazo_manuten_o_br_net", "prazo_manuten_o_br_net_op"],
} as const;

export const CAMPOS = {
  empresa: "nome_da_empresa_conforme_br_net",
  grupo: "grupo_econ_mico_conforme_br_net",
  // Conector para a database "Equipe Comercial" (nome + e-mail)
  gestor: "informar_o_respons_vel_pela_sua_conta_na_br_med_restored",
  demanda: "tipo_de_documento",
  // Tier no esquema novo ([NEW]), na fase e no formulário inicial. Reserva quando a DB - BR NET não traz o tier.
  // Os campos antigos (Tier 1/2/3, Lighthouse) ficam de fora.
  tier: ["new", "new_informar_o_tier_que_pertence_o_cliente_formul_rio_inicial"],
  // Conectores para a DB - BR NET, em ordem de preferência: dão o registro da empresa (empresa_name, grupo, gestor, tier)
  empresaBrnet: ["new_informar_a_empresa_br_net", "selecione_a_empresa_do_brnet"],
  // Card de Notify (qualquer um preenchido) não entra
  notify: ["formulario_notify_cancelamento_de_inscri_o_oculto", "formulario_notify_inclus_o_de_regra_oculto"],
} as const;

// Título de card que não entra (demanda interna)
export const TITULO_EXCLUIDO = "alteracao de prazo";
// Card com este título (normalizado) é rascunho e não entra
export const TITULO_RASCUNHO = "rascunho";

// Por quantos dias o tier e o gestor de uma empresa, consultados na DB - BR NET, valem no cache do Postgres
export const BRNET_VALIDADE_DIAS = 7;

// Ordem dos tiers no painel (esquema novo, o mesmo da DB - BR NET)
export const TIERS = ["Diamante", "Ouro", "Prata", "Bronze", "Bronze(-)", "RG", "Parceiros / Cortesia"];

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
    tier: "tier",
  },
} as const;

export const linkCard = (cardId: string) => `https://app.pipefy.com/open-cards/${cardId}`;

// Janela da edição: vencidos, hoje e até hoje + D_RADAR dias úteis (seg–sex, fora de FERIADOS)
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
