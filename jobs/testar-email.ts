// Gera o Briefing de um gestor com dados reais e, com --enviar, manda para --para (nunca para o gestor).
// Uso: tsx jobs/testar-email.ts [--gestor="Nome"] [--data=AAAA-MM-DD] [--cache] [--radar-horas=24] [--enviar --para=email]
//   --radar-horas  janela do bloco do Radar (o que entrou nas últimas N horas); padrão 24
import { writeFile } from "node:fs/promises";
import { cacheBrnet, fecharBanco } from "./banco";
import { itensComCache } from "./cache";
import { carteiras } from "./edicao";
import { htmlDePrevia, linkRadar, MandrillRemetente, montarEmail } from "./email";
import type { Aviso } from "./pipefy";
import { radarDaCarteira } from "./radar-banco";
import { hojeEmSP, normalizar } from "./regras";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);

async function main() {
  const avisos: Aviso[] = [];
  const data = arg("data") ?? hojeEmSP(new Date());
  const todos = await itensComCache(data, avisos, flag("cache"), cacheBrnet);
  const lista = carteiras(todos);

  console.log(`\nEdição da manhã de ${data}: ${todos.length} itens, ${avisos.length} avisos`);
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

  const horas = Number(arg("radar-horas") ?? 24);
  const radar = await radarDaCarteira(c.nome, new Date(Date.now() - horas * 3600e3), linkRadar(c.nome));
  console.log(`Radar: ${radar ? `${radar.novas} notícias novas, ${radar.agir} pedem ação` : "sem notícia nova (bloco não aparece)"}`);

  const para = arg("para");
  const msg = await montarEmail(c, data, "manha", para ?? c.email ?? "sem-email@invalido", radar);
  const arquivo = `tmp/email-${normalizar(c.nome).replace(/\W+/g, "-")}.html`;
  await writeFile(arquivo, htmlDePrevia(msg));
  console.log(`\nPrévia de ${c.nome}: ${arquivo}\nAssunto: ${msg.assunto}`);

  if (flag("enviar")) {
    if (!para) throw new Error("--enviar exige --para=seu@email (o teste nunca envia para o gestor)");
    const r = await new MandrillRemetente().enviar({ ...msg, assunto: `[TESTE] ${msg.assunto}` });
    console.log(`Enviado para ${para} — Mandrill id ${r.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(fecharBanco);
