CREATE TABLE "radar_feedback" (
	"sinal_id" text NOT NULL,
	"email" text NOT NULL,
	"util" boolean NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_feedback_sinal_id_email_pk" PRIMARY KEY("sinal_id","email")
);
--> statement-breakpoint
CREATE TABLE "radar_perfis" (
	"grupo" text PRIMARY KEY NOT NULL,
	"termos" text[] DEFAULT '{}' NOT NULL,
	"exclusoes" text[] DEFAULT '{}' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_sinais" (
	"id" text PRIMARY KEY NOT NULL,
	"grupo" text NOT NULL,
	"tier" text,
	"gestor_nome" text,
	"gestor_email" text,
	"titulo" text NOT NULL,
	"resumo" text NOT NULL,
	"proximo_passo" text NOT NULL,
	"tipo" text NOT NULL,
	"prioridade" text NOT NULL,
	"publicado_em" date,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fontes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_vistos" (
	"grupo" text NOT NULL,
	"url" text NOT NULL,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radar_vistos_grupo_url_pk" PRIMARY KEY("grupo","url")
);
--> statement-breakpoint
ALTER TABLE "radar_feedback" ADD CONSTRAINT "radar_feedback_sinal_id_radar_sinais_id_fk" FOREIGN KEY ("sinal_id") REFERENCES "public"."radar_sinais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "radar_sinais_grupo" ON "radar_sinais" USING btree ("grupo");--> statement-breakpoint
CREATE INDEX "radar_sinais_coletado" ON "radar_sinais" USING btree ("coletado_em");