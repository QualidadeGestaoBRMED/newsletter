// Entrada do job do Radar de clientes: tsx jobs/radar.ts [--dry-run] [--grupo=NOME] [--todos] [--janela=d|w|m] [--limite=N]
// Coleta notícias e LinkedIn dos grupos monitorados, descarta o que já foi visto, manda o resto para a triagem da IA e grava os sinais.
//   --dry-run   só coleta e imprime (sem IA e sem gravar)
//   --grupo     um grupo só (nome exato, como na edição), ignorando tier e frequência
//   --todos     ignora a frequência por tier (útil na primeira carga)
//   --janela    período da busca: d (24 h), w (7 dias, padrão), m (30 dias)
import "./env";
import { coletar } from "./radar-coleta";
import { coletaHoje, dentroDaJanela, filtrarItens, tiersMonitorados } from "./radar-regras";
import { triar, uso } from "./radar-triagem";
import { hojeEmSP } from "./regras";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string) => process.argv.includes(`--${k}`);
const DIAS_JANELA = { d: 2, w: 8, m: 31 } as const;

async function main() {
  const hoje = hojeEmSP(new Date());
  const janela = (arg("janela") ?? "w") as keyof typeof DIAS_JANELA;
  if (!(janela in DIAS_JANELA)) throw new Error(`--janela inválida: ${janela} (use d, w ou m)`);
  const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const seco = flag("dry-run");
  const banco = await import("./radar-banco");

  try {
    let grupos = await banco.gruposMonitorados(hoje);
    const so = arg("grupo");
    if (so) {
      grupos = grupos.filter((g) => g.nome === so);
      if (!grupos.length) throw new Error(`Grupo "${so}" não aparece nas edições dos últimos 30 dias`);
    } else {
      const tiers = tiersMonitorados();
      grupos = grupos.filter((g) => g.tier && tiers.includes(g.tier) && (flag("todos") || coletaHoje(g.tier, diaSemana)));
    }
    const limite = Number(arg("limite"));
    if (limite > 0) grupos = grupos.slice(0, limite);
    console.log(JSON.stringify({ hoje, janela, grupos: grupos.length, dryRun: seco }));

    let consultas = 0,
      novos = 0,
      gravados = 0;
    const falhas: string[] = [];
    for (const g of grupos) {
      try {
        const c = await coletar(g.termos, hoje, janela);
        consultas += c.consultas;
        const itens = filtrarItens(c.itens, g.exclusoes).filter((i) => dentroDaJanela(i, hoje, DIAS_JANELA[janela]));
        const vistos = seco ? new Set<string>() : await banco.jaVistos(g.nome, itens.map((i) => i.url));
        const ineditos = itens.filter((i) => !vistos.has(i.url));
        novos += ineditos.length;
        if (seco) {
          console.log(`\n${g.nome} (${g.tier}) · ${ineditos.length} itens`);
          for (const i of ineditos) console.log(`  ${i.data ?? "sem data"} | ${i.origem} | ${i.veiculo} | ${i.titulo}`);
          continue;
        }
        if (!ineditos.length) continue;
        const sinais = await triar({ nome: g.nome, tier: g.tier, unidades: g.unidades }, ineditos);
        await banco.gravarSinais(g, ineditos, sinais);
        gravados += sinais.length;
        console.log(JSON.stringify({ grupo: g.nome, itens: ineditos.length, sinais: sinais.length }));
      } catch (e) {
        falhas.push(g.nome);
        console.error(`Falha em ${g.nome}: ${e instanceof Error ? e.message : e}`);
      }
    }

    console.log(JSON.stringify({ consultas, itensNovos: novos, sinais: gravados, falhas: falhas.length, ia: uso }));
    // falha isolada não derruba a coleta; falha geral (ex.: chave inválida) sim, para o Actions avisar
    if (grupos.length && falhas.length === grupos.length) throw new Error(`Todos os ${falhas.length} grupos falharam`);
  } finally {
    await banco.fecharBanco();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
