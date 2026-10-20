// Retrato de cada edição. O id da edição é "AAAA-MM-DD-manha|tarde", o mesmo formato dos links.
import { date, integer, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";

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
