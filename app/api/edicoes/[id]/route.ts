import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { AREA_NOME } from "@/jobs/config";
import { ID_EDICAO, type Linha } from "@/lib/painel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await auth())) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  const { id } = await params;
  if (!ID_EDICAO.test(id)) return NextResponse.json({ erro: "id de edição inválido" }, { status: 400 });

  const [edicao] = await db.select().from(schema.edicoes).where(eq(schema.edicoes.id, id));
  if (!edicao) return NextResponse.json({ erro: "edição não encontrada" }, { status: 404 });

  const itens = await db.select().from(schema.itensEdicao).where(eq(schema.itensEdicao.edicao_id, id));
  const linhas: Linha[] = itens.map((i) => ({
    linha_id: `${edicao.data}_${i.item_id}`,
    edicao_data: edicao.data,
    item_id: i.item_id,
    card_id: i.card_id,
    card: i.card,
    demanda: i.demanda,
    area: AREA_NOME[i.area],
    gestor: i.gestor_nome ?? "Sem gestor",
    tier: i.tier ?? "Sem tier",
    grupo: i.grupo,
    empresa: i.empresa,
    campo_prazo: i.campo_prazo,
    prazo: i.prazo,
    status: i.status,
    dias_atraso: i.dias_atraso,
    situacao_fim_dia: i.situacao_fim_dia ?? "",
    fase: i.fase_nome,
    link: i.link,
  }));
  return NextResponse.json({ edicao: { ...edicao, gerada_em: edicao.gerada_em.toISOString() }, linhas });
}
