// 👍/👎 de um sinal. Um voto por pessoa; votar de novo troca o voto, e `util: null` apaga.
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as z from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

const Corpo = z.object({ sinal_id: z.string().min(1).max(64), util: z.boolean().nullable() });

export async function POST(req: Request) {
  const sessao = await auth();
  const email = sessao?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ erro: "pedido inválido" }, { status: 400 });

  const f = schema.radarFeedback;
  const { sinal_id, util } = p.data;
  if (util === null) {
    await db.delete(f).where(and(eq(f.sinal_id, sinal_id), eq(f.email, email)));
    return NextResponse.json({ ok: true });
  }
  const [existe] = await db.select({ id: schema.radarSinais.id }).from(schema.radarSinais).where(eq(schema.radarSinais.id, sinal_id));
  if (!existe) return NextResponse.json({ erro: "sinal não encontrado" }, { status: 404 });
  await db
    .insert(f)
    .values({ sinal_id, email, util })
    .onConflictDoUpdate({ target: [f.sinal_id, f.email], set: { util, em: sql`now()` } });
  return NextResponse.json({ ok: true });
}
