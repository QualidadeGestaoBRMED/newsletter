import { desc, sql } from "drizzle-orm";
import { Suspense } from "react";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { listaGestao } from "@/lib/acesso";
import Painel from "./painel";

export const dynamic = "force-dynamic";

// gestor cujo e-mail é o de quem entrou, pela edição mais recente em que ele aparece; a gestão abre na visão de todos
async function gestorDe(email: string) {
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

export default async function Page() {
  const sessao = await auth();
  const email = sessao?.user?.email?.toLowerCase() ?? "";
  return (
    <Suspense>
      <Painel gestorInicial={await gestorDe(email)} />
    </Suspense>
  );
}
