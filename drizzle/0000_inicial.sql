CREATE TABLE "edicoes" (
	"id" text PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"periodo" text NOT NULL,
	"gerada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'gerada' NOT NULL,
	CONSTRAINT "edicoes_data_periodo_unique" UNIQUE("data","periodo")
);
--> statement-breakpoint
CREATE TABLE "envios" (
	"edicao_id" text NOT NULL,
	"destinatario" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" text,
	CONSTRAINT "envios_edicao_id_destinatario_pk" PRIMARY KEY("edicao_id","destinatario")
);
--> statement-breakpoint
CREATE TABLE "itens_edicao" (
	"edicao_id" text NOT NULL,
	"item_id" text NOT NULL,
	"card_id" text NOT NULL,
	"card" text NOT NULL,
	"area" text NOT NULL,
	"demanda" text NOT NULL,
	"empresa" text NOT NULL,
	"grupo" text NOT NULL,
	"gestor_nome" text,
	"gestor_email" text,
	"campo_prazo" text NOT NULL,
	"prazo" date NOT NULL,
	"status" text NOT NULL,
	"dias_atraso" integer NOT NULL,
	"fase_id" text NOT NULL,
	"fase_nome" text NOT NULL,
	"link" text NOT NULL,
	"situacao_fim_dia" text,
	CONSTRAINT "itens_edicao_edicao_id_item_id_pk" PRIMARY KEY("edicao_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_edicao_id_edicoes_id_fk" FOREIGN KEY ("edicao_id") REFERENCES "public"."edicoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_edicao" ADD CONSTRAINT "itens_edicao_edicao_id_edicoes_id_fk" FOREIGN KEY ("edicao_id") REFERENCES "public"."edicoes"("id") ON DELETE cascade ON UPDATE no action;