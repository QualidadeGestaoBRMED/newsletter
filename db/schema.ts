// Retrato de cada edição. O id da edição é "AAAA-MM-DD-manha|tarde", o mesmo formato dos links.
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { FonteSinal, Prioridade, TipoSinal } from "../lib/radar";

export const edicoes = pgTable(
  "edicoes",
  {
    id: text("id").primaryKey(),
    data: date("data", { mode: "string" }).notNull(),
    periodo: text("periodo", { enum: ["manha", "tarde"] }).notNull(),
    gerada_em: timestamp("gerada_em", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: ["gerada", "enviada", "falhou"] }).notNull().default("gerada"),
  },
  (t) => [unique().on(t.data, t.periodo)],
);

export const itensEdicao = pgTable(
  "itens_edicao",
  {
    edicao_id: text("edicao_id")
      .notNull()
      .references(() => edicoes.id, { onDelete: "cascade" }),
    item_id: text("item_id").notNull(),
    card_id: text("card_id").notNull(),
    card: text("card").notNull(),
    area: text("area", { enum: ["ST", "SO", "OG"] }).notNull(),
    demanda: text("demanda").notNull(),
    empresa: text("empresa").notNull(),
    grupo: text("grupo").notNull(),
    gestor_nome: text("gestor_nome"),
    gestor_email: text("gestor_email"),
    tier: text("tier"),
    campo_prazo: text("campo_prazo").notNull(),
    prazo: date("prazo", { mode: "string" }).notNull(),
    status: text("status", { enum: ["Atrasado", "Próximo do vencimento", "No radar (até D+2)"] }).notNull(),
    dias_atraso: integer("dias_atraso").notNull(),
    fase_id: text("fase_id").notNull(),
    fase_nome: text("fase_nome").notNull(),
    link: text("link").notNull(),
    situacao_fim_dia: text("situacao_fim_dia", { enum: ["Concluído hoje", "Pendente"] }),
  },
  (t) => [primaryKey({ columns: [t.edicao_id, t.item_id] })],
);

// Cache das consultas à DB - BR NET por empresa (chave = nome normalizado). Nulos = empresa sem o dado ou não encontrada.
export const brnetEmpresas = pgTable("brnet_empresas", {
  chave: text("chave").primaryKey(),
  empresa: text("empresa").notNull(),
  coordenador: text("coordenador"),
  tier: text("tier"),
  consultado_em: timestamp("consultado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Idempotência do envio: um e-mail por destinatário por edição.
export const envios = pgTable(
  "envios",
  {
    edicao_id: text("edicao_id")
      .notNull()
      .references(() => edicoes.id, { onDelete: "cascade" }),
    destinatario: text("destinatario").notNull(),
    enviado_em: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
    message_id: text("message_id"),
  },
  (t) => [primaryKey({ columns: [t.edicao_id, t.destinatario] })],
);

// ---------- Radar de clientes ----------

// Sinais já triados pela IA. Um sinal junta as publicações de um mesmo fato sobre um grupo.
export const radarSinais = pgTable(
  "radar_sinais",
  {
    id: text("id").primaryKey(), // hash do grupo + URL da fonte principal
    grupo: text("grupo").notNull(),
    tier: text("tier"),
    gestor_nome: text("gestor_nome"),
    gestor_email: text("gestor_email"),
    titulo: text("titulo").notNull(),
    resumo: text("resumo").notNull(),
    proximo_passo: text("proximo_passo").notNull(),
    tipo: text("tipo").$type<TipoSinal>().notNull(),
    prioridade: text("prioridade", { enum: ["agir", "acompanhar", "contexto"] }).$type<Prioridade>().notNull(),
    publicado_em: date("publicado_em", { mode: "string" }),
    coletado_em: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
    fontes: jsonb("fontes").$type<FonteSinal[]>().notNull(),
  },
  (t) => [index("radar_sinais_grupo").on(t.grupo), index("radar_sinais_coletado").on(t.coletado_em)],
);

// Ajuste fino da busca por grupo. Sem linha aqui, o grupo é buscado pelo próprio nome.
// termos: o que buscar (ex.: a marca pela qual o grupo aparece na imprensa); exclusoes: homônimos a descartar.
export const radarPerfis = pgTable("radar_perfis", {
  grupo: text("grupo").primaryKey(),
  termos: text("termos").array().notNull().default([]),
  exclusoes: text("exclusoes").array().notNull().default([]),
  ativo: boolean("ativo").notNull().default(true),
  atualizado_em: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// URLs que já passaram pela triagem de um grupo: a próxima coleta não paga a IA de novo por elas.
// A chave inclui o grupo porque a mesma matéria pode citar dois clientes.
export const radarVistos = pgTable(
  "radar_vistos",
  {
    grupo: text("grupo").notNull(),
    url: text("url").notNull(),
    visto_em: timestamp("visto_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.grupo, t.url] })],
);

// 👍/👎 de quem leu o sinal no painel (um voto por pessoa; o último vale).
export const radarFeedback = pgTable(
  "radar_feedback",
  {
    sinal_id: text("sinal_id")
      .notNull()
      .references(() => radarSinais.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    util: boolean("util").notNull(),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sinal_id, t.email] })],
);
