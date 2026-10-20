import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // sem .env, usa o ambiente
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  // migração pela conexão direta: o pooler da Neon (PgBouncer em modo transação) não guarda estado de sessão
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
});
