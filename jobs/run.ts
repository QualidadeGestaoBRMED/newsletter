// Entrada do job: tsx jobs/run.ts manha|tarde [--dry-run] [--data=AAAA-MM-DD] [--cache]
// Gera e grava a edição da manhã e, conforme ENVIO (desligado | teste | gestores), envia os e-mails. Tarde entra na etapa 4.
import "./env";
import { itensComCache } from "./cache";
import { FERIADOS, type Periodo } from "./config";
import { carteiras, idEdicao, numeros } from "./edicao";
import { MandrillRemetente } from "./email";
import { enviarEdicao, modoEnvio, resumoProblemas } from "./envio";
import type { Aviso } from "./pipefy";
import { hojeEmSP, type Dia } from "./regras";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const periodo = process.argv[2] as Periodo;
  if (periodo !== "manha" && periodo !== "tarde") throw new Error("Uso: tsx jobs/run.ts manha|tarde [--dry-run] [--data=AAAA-MM-DD]");
  if (periodo === "tarde") throw new Error("A edição da tarde ainda não foi implementada (etapa 4)");

  const data = arg("data") ?? hojeEmSP(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`--data inválida: ${data} (use AAAA-MM-DD)`);
  if (FERIADOS.includes(data) && !arg("data")) return console.log(`${data} é feriado: edição não gerada`);
  const modo = modoEnvio();
  const avisos: Aviso[] = [];
  const banco = await import("./banco");
  try {
    await gerar(data, periodo, avisos, modo, banco);
  } finally {
    await banco.fecharBanco();
  }
}

async function gerar(data: string, periodo: Periodo, avisos: Aviso[], modo: ReturnType<typeof modoEnvio>, banco: typeof import("./banco")) {
  const id = idEdicao(data, periodo);
  if (!flag("dry-run") && (await banco.statusEdicao(id)) === "enviada") return console.log(`Edição ${id} já foi enviada: nada a fazer`);

  // o cache da BR NET é gravado mesmo no --dry-run: ele guarda consultas, não a edição
  const itens = await itensComCache(data, avisos, flag("cache"), banco.cacheBrnet);

  const n = numeros(itens);
  console.log(JSON.stringify({ edicao: `${data}-${periodo}`, itens: itens.length, avisos: avisos.length, ...n }));
  const lista = carteiras(itens);
  for (const c of lista) console.log(JSON.stringify({ gestor: c.nome, email: c.email, itens: c.itens.length }));

  if (flag("dry-run")) return console.log("--dry-run: edição não gravada");
  console.log(`Edição ${await banco.gravarEdicao(data, periodo, itens)} gravada`);

  if (modo === "desligado") return console.log("ENVIO=desligado: e-mails não enviados");
  const alerta = process.env.ALERTA_EMAIL?.trim();
  const remetente = new MandrillRemetente();
  const r = await enviarEdicao(lista, { id, data: data as Dia, periodo }, modo, remetente, banco.registroEnvios, alerta);
  console.log(`ENVIO=${modo}: ${r.enviados.length} enviados, ${r.pulados.length} já tinham recebido, ${r.semEmail.length} gestores sem e-mail, ${r.falhas.length} falhas`);
  for (const f of r.falhas) console.error(`  falhou ${f.gestor}: ${f.erro}`);
  if (modo === "gestores") await banco.marcarEdicao(id, r.falhas.length ? "falhou" : "enviada");

  const problemas = resumoProblemas(r);
  if (problemas && alerta) {
    await remetente
      .enviar({ para: { email: alerta }, assunto: `[Briefing Suporte] Edição ${id}: pontos de atenção no envio`, html: `<pre>${problemas.replace(/</g, "&lt;")}</pre>`, texto: problemas, tags: ["newsletter-suporte", "alerta"] })
      .catch((e) => console.error(`Alerta não enviado: ${e}`));
  }
  if (r.falhas.length) throw new Error(`${r.falhas.length} e-mails falharam`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
