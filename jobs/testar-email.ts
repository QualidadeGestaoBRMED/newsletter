// Gera a newsletter de um gestor com dados reais e, com --enviar, manda para --para (nunca para o gestor).
// Uso: tsx jobs/testar-email.ts [--gestor="Nome"] [--data=AAAA-MM-DD] [--cache] [--enviar --para=email]
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { carteiras, gerarItens } from "./edicao";
import { MandrillRemetente, montarEmail } from "./email";
import { carregarCards, carregarDatabases, type Aviso } from "./pipefy";
import { hojeEmSP, normalizar, type CardCru, type Databases } from "./regras";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);

const CACHE = "tmp/cache-pipefy.json";

async function dados(avisos: Aviso[]): Promise<{ cards: CardCru[]; db: Databases }> {
  if (flag("cache") && existsSync(CACHE)) {
    const c = JSON.parse(await readFile(CACHE, "utf8"));
    const mapa = (x: [string, unknown][]) => new Map(x);
    return { cards: c.cards, db: Object.fromEntries(Object.entries(c.db).map(([k, v]) => [k, mapa(v as [string, unknown][])])) as Databases };
  }
  const t0 = Date.now();
  const [cards, db] = await Promise.all([carregarCards(avisos), carregarDatabases()]);
  console.log(`Pipefy: ${cards.length} cards em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await mkdir("tmp", { recursive: true });
  const dbJson = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, [...(v as Map<string, unknown>)]]));
  await writeFile(CACHE, JSON.stringify({ cards, db: dbJson }));
  return { cards, db };
}

async function main() {
  const avisos: Aviso[] = [];
  const { cards, db } = await dados(avisos);
  const data = arg("data") ?? hojeEmSP(new Date());
  const itens = gerarItens(cards, data, db, avisos);
  const lista = carteiras(itens);

  console.log(`\nEdição da manhã de ${data}: ${itens.length} itens, ${avisos.length} avisos`);
  for (const a of avisos.slice(0, 10)) console.log(`  ⚠ card ${a.card_id}: ${a.motivo}`);
  console.log("\nCarteiras:");
  for (const c of lista) {
    const n = (s: string) => c.itens.filter((i) => i.status === s).length;
    console.log(
      `  ${c.nome.padEnd(28)} ${(c.email ?? "SEM E-MAIL").padEnd(42)} ` +
        `${String(c.itens.length).padStart(4)} itens  (venc ${n("Atrasado")}, hoje ${n("Próximo do vencimento")}, radar ${n("No radar (até D+2)")})`,
    );
  }

  const pedido = arg("gestor");
  const c = pedido ? lista.find((x) => normalizar(x.nome) === normalizar(pedido)) : lista.find((x) => x.email);
  if (!c) throw new Error(`Gestor não encontrado: ${pedido}`);

  const para = arg("para");
  const msg = await montarEmail(c, data, "manha", para ?? c.email ?? "sem-email@invalido");
  const arquivo = `tmp/email-${normalizar(c.nome).replace(/\W+/g, "-")}.html`;
  await writeFile(arquivo, msg.html);
  console.log(`\nPrévia de ${c.nome}: ${arquivo}\nAssunto: ${msg.assunto}`);

  if (flag("enviar")) {
    if (!para) throw new Error("--enviar exige --para=seu@email (o teste nunca envia para o gestor)");
    const r = await new MandrillRemetente().enviar({ ...msg, assunto: `[TESTE] ${msg.assunto}` });
    console.log(`Enviado para ${para} — Mandrill id ${r.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
