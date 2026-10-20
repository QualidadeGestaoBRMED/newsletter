// Lista fases e campos do pipe, mostra cards de exemplo com valores crus e as databases do gestor.
// Uso: tsx jobs/descobrir-campos.ts [--n=3] [--card=ID ...] [--salvar]
// --salvar grava tudo em tmp/descoberta.json (contém dados de clientes: não commitar).
import { mkdir, writeFile } from "node:fs/promises";
import { CAMPOS, CAMPOS_PRAZO, FASES_EXCLUIDAS, PIPE_ID, TABELAS } from "./config";
import { gql } from "./pipefy";

type Campo = { id: string; label: string; type: string };
type Fase = { id: string; name: string; cards_count: number; fields: Campo[] };
type CampoCard = {
  field: { id: string };
  value: string | null;
  date_value: string | null;
  datetime_value: string | null;
  array_value: string[] | null;
  connectedRepoItems: { id: string; title: string }[] | null;
};
type Card = { id: string; title: string; current_phase: { id: string; name: string }; fields: CampoCard[] };

const CARD_FRAG = `
  id title current_phase { id name }
  fields {
    field { id } value date_value datetime_value array_value
    connectedRepoItems { ... on PublicTableRecord { id title } ... on PublicCard { id title } }
  }`;

const args = process.argv.slice(2);
const n = Number(args.find((a) => a.startsWith("--n="))?.slice(4) ?? 3);
const cardsPedidos = args.filter((a) => a.startsWith("--card=")).map((a) => a.slice(7));
const salvar = args.includes("--salvar");

const camposPrazo: string[] = [
  ...CAMPOS_PRAZO.ST,
  CAMPOS_PRAZO.SO.relatorioAnualOculto,
  CAMPOS_PRAZO.SO.prazoRelatorioAnual,
  ...CAMPOS_PRAZO.SO.demais,
  ...CAMPOS_PRAZO.OG,
];
const camposConfig = new Set<string>([...camposPrazo, ...Object.values(CAMPOS).flat()]);

async function main() {
  const { pipe } = await gql<{
    pipe: { name: string; phases: Fase[]; start_form_fields: Campo[] };
  }>(
    `query($id: ID!) { pipe(id: $id) {
      name
      phases { id name cards_count fields { id label type } }
      start_form_fields { id label type }
    } }`,
    { id: PIPE_ID },
  );

  console.log(`\n## Pipe ${PIPE_ID} — ${pipe.name}\n`);
  console.log("### Fases");
  for (const f of pipe.phases) {
    const fora = FASES_EXCLUIDAS[f.id] ? "  (excluída)" : "";
    console.log(`${f.id.padEnd(10)} ${String(f.cards_count).padStart(6)}  ${f.name}${fora}`);
  }

  // campo → onde aparece
  const campos = new Map<string, Campo & { onde: string[] }>();
  const registrar = (c: Campo, onde: string) => {
    const atual = campos.get(c.id) ?? { ...c, onde: [] };
    atual.onde.push(onde);
    campos.set(c.id, atual);
  };
  pipe.start_form_fields.forEach((c) => registrar(c, "formulário inicial"));
  pipe.phases.forEach((f) => f.fields.forEach((c) => registrar(c, `fase ${f.id}`)));

  console.log(`\n### Campos (${campos.size}) — ★ = usado em jobs/config.ts`);
  for (const c of [...campos.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (c.type === "statement") continue;
    const mark = camposConfig.has(c.id) ? "★" : " ";
    console.log(`${mark} ${c.id} | ${c.label} | ${c.type} | ${c.onde.join(", ")}`);
  }

  const faltando = [...camposConfig].filter((id) => !campos.has(id));
  if (faltando.length) console.warn(`\n⚠ Campos do config que NÃO existem no pipe: ${faltando.join(", ")}`);

  // Cards de exemplo: os pedidos por --card ou os primeiros de fases monitoradas com algum prazo preenchido
  const exemplos: Card[] = [];
  for (const id of cardsPedidos) {
    const { card } = await gql<{ card: Card }>(`query($id: ID!) { card(id: $id) { ${CARD_FRAG} } }`, { id });
    exemplos.push(card);
  }
  for (const f of pipe.phases) {
    if (exemplos.length >= Math.max(n, cardsPedidos.length)) break;
    if (FASES_EXCLUIDAS[f.id] || !f.cards_count) continue;
    const { phase } = await gql<{ phase: { cards: { edges: { node: Card }[] } } }>(
      `query($id: ID!) { phase(id: $id) { cards(first: 20) { edges { node { ${CARD_FRAG} } } } } }`,
      { id: f.id },
    );
    const comPrazo = phase.cards.edges
      .map((e) => e.node)
      .find((c) => c.fields.some((x) => camposPrazo.includes(x.field.id) && x.value));
    if (comPrazo) exemplos.push(comPrazo);
  }

  console.log(`\n### Cards de exemplo (${exemplos.length}) — só campos do config`);
  for (const c of exemplos) {
    console.log(`\n#${c.id} "${c.title}" — fase ${c.current_phase.id} ${c.current_phase.name}`);
    for (const x of c.fields.filter((x) => camposConfig.has(x.field.id))) {
      console.log(`  ${x.field.id}`);
      console.log(`    value=${JSON.stringify(x.value)} date_value=${x.date_value} datetime_value=${x.datetime_value}`);
      if (x.array_value?.length) console.log(`    array_value=${JSON.stringify(x.array_value)}`);
      if (x.connectedRepoItems?.length) console.log(`    conectados=${JSON.stringify(x.connectedRepoItems)}`);
    }
  }

  // Databases do gestor
  const tabelas: unknown[] = [];
  for (const t of [TABELAS.gestores, TABELAS.brnet]) {
    const { table } = await gql<{
      table: {
        id: string;
        name: string;
        table_fields: Campo[];
        table_records: { edges: { node: { id: string; title: string; record_fields: { field: { id: string }; value: string }[] } }[] };
      };
    }>(
      `query($id: ID!) { table(id: $id) {
        id name table_fields { id label type }
        table_records(first: 3) { edges { node { id title record_fields { field { id } value } } } }
      } }`,
      { id: t.id },
    );
    tabelas.push(table);
    console.log(`\n### Database ${t.id} (${table.id}) — ${table.name}`);
    table.table_fields.forEach((c) => console.log(`  ${c.id} | ${c.label} | ${c.type}`));
    for (const { node } of table.table_records.edges) {
      const vals = Object.fromEntries(node.record_fields.map((r) => [r.field.id, r.value]));
      console.log(`  #${node.id} ${JSON.stringify(vals)}`);
    }
  }

  if (salvar) {
    await mkdir("tmp", { recursive: true });
    await writeFile("tmp/descoberta.json", JSON.stringify({ pipe, exemplos, tabelas }, null, 2));
    console.log("\nSalvo em tmp/descoberta.json");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
