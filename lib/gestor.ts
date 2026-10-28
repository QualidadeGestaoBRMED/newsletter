// Gestor de quem entrou: abre o painel e o Radar já na própria carteira.
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listaGestao } from "@/lib/acesso";

/** Gestor cujo e-mail é o de quem entrou, pela edição mais recente em que ele aparece; a gestão abre na visão de todos. */
export async function gestorDe(email: string) {
  if (!email || listaGestao().has(email)) return null;
  const i = schema.itensEdicao;
  const [r] = await db
    .select({ nome: i.gestor_nome })
    .from(i)
    .where(sql`lower(${i.gestor_email}) = ${email}`)
    .orderBy(desc(i.edicao_id))
    .limit(1);
  return r?.nome ?? null;
}
