import { z } from "zod";
import { PIPE_ID, PIPEFY_URL, TABELAS } from "./config";
import { exigir } from "./env";
import { faseMonitorada, normalizar, type CampoCru, type CardCru, type Databases } from "./regras";

const TENTATIVAS = 6;
const ESPERA_BASE_MS = 1_000;

export class PipefyError extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uma chamada GraphQL, com retry e backoff exponencial em 429/5xx e falha de rede. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = exigir("PIPEFY_TOKEN").replace(/^bearer\s+/i, "");
  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    if (tentativa > 0) {
      const espera = ESPERA_BASE_MS * 2 ** (tentativa - 1) + Math.random() * 250;
      await dormir(espera);
    }

    let res: Response;
    try {
      res = await fetch(PIPEFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      ultimoErro = e;
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      ultimoErro = new PipefyError(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0) await dormir(retryAfter * 1000);
      continue;
    }
    if (!res.ok) throw new PipefyError(`HTTP ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new PipefyError(body.errors.map((e) => e.message).join("; "));
    if (!body.data) throw new PipefyError("Resposta sem data");
    return body.data;
  }

  throw new PipefyError(`Pipefy falhou após ${TENTATIVAS} tentativas: ${String(ultimoErro)}`);
}

export type Pagina<N> = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: { node: N }[];
};

/** Percorre uma conexão paginada por cursor até o fim. `pegar` extrai a conexão da resposta. */
export async function* paginar<R, N>(
  query: string,
  variables: Record<string, unknown>,
  pegar: (r: R) => Pagina<N>,
): AsyncGenerator<N> {
  let after: string | null = null;
  do {
    const pagina = pegar(await gql<R>(query, { ...variables, after }));
    for (const e of pagina.edges) yield e.node;
    after = pagina.pageInfo.hasNextPage ? pagina.pageInfo.endCursor : null;
  } while (after);
}

// ---------- leitura do pipe e das databases ----------

const CampoZ = z.object({
  field: z.object({ id: z.string() }),
  value: z.string().nullable(),
  date_value: z.string().nullish(),
  datetime_value: z.string().nullish(),
  array_value: z.array(z.string()).nullish(),
  connectedRepoItems: z.array(z.object({ id: z.string().optional(), title: z.string().nullish() })).nullish(),
});

const CardZ = z.object({
  id: z.string(),
  title: z.string().nullable(),
  current_phase: z.object({ id: z.string(), name: z.string() }),
  fields: z.array(CampoZ),
});

const CARD_FRAG = `
  id title current_phase { id name }
  fields {
    field { id } value date_value datetime_value array_value
    connectedRepoItems { ... on PublicTableRecord { id title } ... on PublicCard { id title } }
  }`;

export type Aviso = { card_id?: string; motivo: string };

function paraCardCru(c: z.infer<typeof CardZ>): CardCru {
  const campos: Record<string, CampoCru> = {};
  for (const f of c.fields) {
    campos[f.field.id] = {
      ...f,
      connectedRepoItems: f.connectedRepoItems
        ?.filter((x) => x.id)
        .map((x) => ({ id: x.id!, title: x.title ?? "" })),
    };
  }
  return { id: c.id, title: c.title ?? "", fase: { id: c.current_phase.id, nome: c.current_phase.name }, campos };
}

/** Todos os cards das fases monitoradas. Card que não passa no schema vira aviso. */
export async function carregarCards(avisos: Aviso[]): Promise<CardCru[]> {
  const { pipe } = await gql<{ pipe: { phases: { id: string; name: string; cards_count: number }[] } }>(
    `query($id: ID!) { pipe(id: $id) { phases { id name cards_count } } }`,
    { id: PIPE_ID },
  );

  const cards: CardCru[] = [];
  for (const fase of pipe.phases) {
    if (!faseMonitorada(fase.id) || !fase.cards_count) continue;
    const nodes = paginar<{ phase: { cards: Pagina<unknown> } }, unknown>(
      `query($id: ID!, $after: String) { phase(id: $id) { cards(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor } edges { node { ${CARD_FRAG} } }
      } } }`,
      { id: fase.id },
      (r) => r.phase.cards,
    );
    for await (const node of nodes) {
      const ok = CardZ.safeParse(node);
      if (ok.success) cards.push(paraCardCru(ok.data));
      else avisos.push({ card_id: (node as { id?: string })?.id, motivo: `schema: ${ok.error.issues[0]?.message}` });
    }
  }
  return cards;
}

const RegistroZ = z.object({
  id: z.string(),
  title: z.string().nullable(),
  record_fields: z.array(z.object({ field: z.object({ id: z.string() }), value: z.string().nullable() })),
});

async function registros(tabelaId: string): Promise<{ id: string; title: string; v: Record<string, string> }[]> {
  const out = [];
  const nodes = paginar<{ table: { table_records: Pagina<unknown> } }, unknown>(
    `query($id: ID!, $after: String) { table(id: $id) { table_records(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor } edges { node { id title record_fields { field { id } value } } }
    } } }`,
    { id: tabelaId },
    (r) => r.table.table_records,
  );
  for await (const node of nodes) {
    const r = RegistroZ.parse(node);
    out.push({
      id: r.id,
      title: r.title ?? "",
      v: Object.fromEntries(r.record_fields.map((f) => [f.field.id, f.value?.trim() ?? ""])),
    });
  }
  return out;
}

/** Equipe Comercial (nome + e-mail) e DB - BR NET (empresa/grupo → gestor). */
export async function carregarDatabases(): Promise<Databases> {
  const [gestores, brnet] = await Promise.all([registros(TABELAS.gestores.id), registros(TABELAS.brnet.id)]);
  const g = TABELAS.gestores;
  const b = TABELAS.brnet;

  const db: Databases = {
    gestorPorRegistro: new Map(),
    gestorPorNome: new Map(),
    coordenadorPorEmpresa: new Map(),
    coordenadorPorGrupo: new Map(),
  };
  for (const r of gestores) {
    const nome = r.v[g.nome] || r.title;
    if (!nome || nome === "Rascunho") continue;
    const gestor = { nome, email: r.v[g.email]?.toLowerCase() || null };
    db.gestorPorRegistro.set(r.id, gestor);
    db.gestorPorNome.set(normalizar(nome), gestor);
  }
  for (const r of brnet) {
    const coord = r.v[b.gestor];
    if (!coord) continue;
    if (r.v[b.empresa]) db.coordenadorPorEmpresa.set(normalizar(r.v[b.empresa]), coord);
    if (r.v[b.grupo]) db.coordenadorPorGrupo.set(normalizar(r.v[b.grupo]), coord);
  }
  return db;
}
