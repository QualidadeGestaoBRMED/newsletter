// Disparo da edição da manhã pelo agendador da Vercel (vercel.json): pede ao GitHub para rodar o workflow, como o botão
// "Run workflow". O agendamento do próprio Actions atrasa horas e continua como reserva; o job não repete uma edição já enviada.
import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron";

export const dynamic = "force-dynamic";

const WORKFLOW = "https://api.github.com/repos/QualidadeGestaoBRMED/newsletter/actions/workflows/newsletter.yml/dispatches";

export async function GET(req: Request) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  // token do GitHub com permissão de Actions (leitura e escrita) só neste repositório
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) return NextResponse.json({ erro: "GITHUB_DISPATCH_TOKEN não definido" }, { status: 500 });

  const r = await fetch(WORKFLOW, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { periodo: "manha" } }),
  });
  if (!r.ok) {
    const detalhe = (await r.text()).slice(0, 300);
    console.error(`cron/briefing: GitHub respondeu ${r.status}: ${detalhe}`);
    return NextResponse.json({ erro: `GitHub respondeu ${r.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, disparado_em: new Date().toISOString() });
}
