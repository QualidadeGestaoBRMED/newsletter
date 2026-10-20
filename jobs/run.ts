// Entrada do job: tsx jobs/run.ts manha|tarde [--dry-run] [--data=AAAA-MM-DD] [--cache]
// Por enquanto gera e grava a edição da manhã. Tarde entra na etapa 4 e o envio dos e-mails na etapa 7.
import "./env";
import { itensComCache } from "./cache";
import type { Periodo } from "./config";
import { carteiras, numeros } from "./edicao";
import type { Aviso, CacheBrnet } from "./pipefy";
import { hojeEmSP } from "./regras";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const periodo = process.argv[2] as Periodo;
  if (periodo !== "manha" && periodo !== "tarde") throw new Error("Uso: tsx jobs/run.ts manha|tarde [--dry-run] [--data=AAAA-MM-DD]");
  if (periodo === "tarde") throw new Error("A edição da tarde ainda não foi implementada (etapa 4)");

  const data = arg("data") ?? hojeEmSP(new Date());
  const avisos: Aviso[] = [];
  const { cacheBrnet, gravarEdicao, fecharBanco } = await import("./banco");
  try {
    await gerar(data, periodo, avisos, cacheBrnet, gravarEdicao);
  } finally {
    await fecharBanco();
  }
}

async function gerar(data: string, periodo: Periodo, avisos: Aviso[], brnet: CacheBrnet, gravarEdicao: typeof import("./banco").gravarEdicao) {
  // o cache da BR NET é gravado mesmo no --dry-run: ele guarda consultas, não a edição
  const itens = await itensComCache(data, avisos, flag("cache"), brnet);

  const n = numeros(itens);
  console.log(JSON.stringify({ edicao: `${data}-${periodo}`, itens: itens.length, avisos: avisos.length, ...n }));
  for (const c of carteiras(itens)) console.log(JSON.stringify({ gestor: c.nome, email: c.email, itens: c.itens.length }));

  if (flag("dry-run")) return console.log("--dry-run: edição não gravada");
  console.log(`Edição ${await gravarEdicao(data, periodo, itens)} gravada`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
