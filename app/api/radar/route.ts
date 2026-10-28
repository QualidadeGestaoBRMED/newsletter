// Sinais do Radar dos últimos 90 dias, com o voto de quem está lendo. A tela filtra por gestor, tier e grupo.
import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import type { Sinal } from "@/lib/radar";

export const dynamic = "force-dynamic";

const DIAS = 90;

export async function GET() {
  const sessao = await auth();
  if (!sessao) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  const email = sessao.user?.email?.toLowerCase() ?? "";
  const s = schema.radarSinais;
  const f = schema.radarFeedback;

  const desde = new Date(Date.now() - DIAS * 864e5);
  const rows = await db
    .select({ sinal: s, util: f.util })
    .from(s)
    .leftJoin(f, and(eq(f.sinal_id, s.id), eq(f.email, email)))
    .where(gte(s.coletado_em, desde))
    .orderBy(desc(s.coletado_em))
    .limit(2000);

  const sinais: (Sinal & { voto: boolean | null })[] = rows.map(({ sinal: x, util }) => ({
    id: x.id,
    grupo: x.grupo,
    tier: x.tier,
    gestor: x.gestor_nome,
    titulo: x.titulo,
    resumo: x.resumo,
    proximo_passo: x.proximo_passo,
    tipo: x.tipo,
    prioridade: x.prioridade,
    publicado_em: x.publicado_em,
    coletado_em: x.coletado_em.toISOString(),
    fontes: x.fontes,
    voto: util,
  }));
  return NextResponse.json({ sinais });
}
