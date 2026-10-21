// Série das edições da manhã para o gráfico de evolução, com os mesmos filtros do painel (sem a busca).
import { and, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { AREA_NOME, type Area } from "@/jobs/config";
import type { PontoSerie } from "@/lib/painel";

export const dynamic = "force-dynamic";

const LIMITE = 90; // edições mais recentes

export async function GET(req: Request) {
  if (!(await auth())) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const e = schema.edicoes;
  const i = schema.itensEdicao;

  // filtros entram no JOIN, não no WHERE: uma edição sem itens no recorte continua na série, com zero
  const noJoin: SQL[] = [eq(i.edicao_id, e.id)];
  const gestor = p.get("gestor");
  if (gestor) noJoin.push(gestor === "Sem gestor" ? isNull(i.gestor_nome) : eq(i.gestor_nome, gestor));
  const grupo = p.get("grupo");
  if (grupo) noJoin.push(eq(i.grupo, grupo));
  const empresa = p.get("empresa");
  if (empresa) noJoin.push(eq(i.empresa, empresa));
  const area = (Object.keys(AREA_NOME) as Area[]).find((k) => AREA_NOME[k] === p.get("area"));
  if (p.get("area")) noJoin.push(area ? eq(i.area, area) : sql`false`);
  const tier = p.get("tier");
  if (tier) noJoin.push(tier === "Sem tier" ? isNull(i.tier) : eq(i.tier, tier));

  const conta = (status: string) => sql<number>`(count(*) filter (where ${i.status} = ${status}))::int`;
  const rows = await db
    .select({ id: e.id, data: e.data, vencidas: conta("Atrasado"), hoje: conta("Próximo do vencimento"), radar: conta("No radar (até D+2)") })
    .from(e)
    .leftJoin(i, and(...noJoin))
    .where(and(eq(e.periodo, "manha"), ne(e.status, "falhou")))
    .groupBy(e.id, e.data)
    .orderBy(desc(e.data))
    .limit(LIMITE);

  const serie: PontoSerie[] = rows.reverse();
  return NextResponse.json({ serie });
}
