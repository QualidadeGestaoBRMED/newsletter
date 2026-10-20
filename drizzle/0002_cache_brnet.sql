CREATE TABLE "brnet_empresas" (
	"chave" text PRIMARY KEY NOT NULL,
	"empresa" text NOT NULL,
	"coordenador" text,
	"tier" text,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
