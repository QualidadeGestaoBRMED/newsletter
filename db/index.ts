// Conexão com o Postgres da Neon. App e job usam o DATABASE_URL (pooler); as migrações usam o direto (drizzle.config.ts).
import { parseEnv } from "@neon/env";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import config from "../neon";
import * as schema from "./schema";

const { postgres } = parseEnv(config, ["DATABASE_URL"]);

// Reaproveita o pool entre recargas do `next dev`.
const g = globalThis as unknown as { pool?: Pool };
export const pool = (g.pool ??= new Pool({ connectionString: postgres.databaseUrl, max: 5 }));
// Na Vercel (Fluid compute) fecha as conexões ociosas antes de a função ser suspensa; fora dela não faz nada.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
