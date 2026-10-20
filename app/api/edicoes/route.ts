import { desc, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import type { EdicaoResumo } from "@/lib/painel";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = schema.edicoes;
  const rows = await db
    .select()
    .from(e)
    .where(ne(e.status, "falhou"))
    .orderBy(desc(e.data), desc(e.periodo)); // "tarde" > "manha": a das 18:00 vem antes no mesmo dia
  const edicoes: EdicaoResumo[] = rows.map((r) => ({ ...r, gerada_em: r.gerada_em.toISOString() }));
  return NextResponse.json({ edicoes });
}
