import { z } from "zod";
import { PIPE_ID, PIPEFY_URL, TABELAS } from "./config";
import { exigir } from "./env";
import { faseMonitorada, idRegistroBrnet, normalizar, parseDia, type CampoCru, type CardCru, type Databases, type RegistroBrnet } from "./regras";

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
  createdAt: z.string().nullish(),
  current_phase: z.object({ id: z.string(), name: z.string() }),
  phases_history: z.array(z.object({ phase: z.object({ id: z.string() }) })).nullish(),
  fields: z.array(CampoZ),
});

const CARD_FRAG = `
  id title createdAt current_phase { id name }
  phases_history { phase { id } }
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
  return { id: c.id, title: c.title ?? "", fase: { id: c.current_phase.id, nome: c.current_phase.name }, campos, fasesPassadas: (c.phases_history ?? []).map((h) => h.phase.id), criadoEm: parseDia(c.createdAt) || undefined };
}

/** Todos os cards das fases monitoradas. Card que não passa no schema vira aviso. */
export async function carregarCards(avisos: Aviso[]): Promise<CardCru[]> {
  const { pipe } = await gql<{ pipe: { phases: { id: string; name: string; cards_count: number }[] } }>(
    `query($id: ID!) { pipe(id: $id) { phases { id name cards_count } } }`,
    { id: PIPE_ID },
  );

  const fases = pipe.phases.filter((f) => faseMonitorada(f.id) && f.cards_count);
  const porFase = await emParalelo(fases, 4, async (fase) => {
    const out: CardCru[] = [];
    const nodes = paginar<{ phase: { cards: Pagina<unknown> } }, unknown>(
      `query($id: ID!, $after: String) { phase(id: $id) { cards(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor } edges { node { ${CARD_FRAG} } }
      } } }`,
      { id: fase.id },
      (r) => r.phase.cards,
    );
    for await (const node of nodes) {
      const ok = CardZ.safeParse(node);
      if (ok.success) out.push(paraCardCru(ok.data));
      else avisos.push({ card_id: (node as { id?: string })?.id, motivo: `schema: ${ok.error.issues[0]?.message}` });
    }
    log(`fase ${fase.id} ${fase.name}: ${out.length} cards`);
    return out;
  });
  const cards = semRepetidos(porFase.flat());
  const repetidos = porFase.flat().length - cards.length;
  if (repetidos) log(`${repetidos} cards mudaram de fase durante a leitura e vieram duas vezes; mantida uma cópia`);
  return cards;
}

/** As fases são lidas em paralelo: um card que muda de fase no meio da leitura aparece nas duas. Fica a primeira cópia. */
export function semRepetidos(cards: CardCru[]): CardCru[] {
  const vistos = new Set<string>();
  return cards.filter((c) => !vistos.has(c.id) && vistos.add(c.id));
}

const log = (msg: string) => {
  if (process.env.PIPEFY_LOG !== "0") console.error(`[pipefy] ${msg}`);
};

/** map assíncrono com no máximo `n` chamadas ao mesmo tempo, mantendo a ordem. */
async function emParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await f(xs[k]);
      }
    }),
  );
  return out;
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

/** Equipe Comercial inteira (~150 registros). A DB - BR NET (~26 mil) é consultada sob demanda em `completarBrnet`. */
export async function carregarDatabases(): Promise<Databases> {
  const g = TABELAS.gestores;
  const db: Databases = {
    gestorPorRegistro: new Map(),
    gestorPorNome: new Map(),
    coordenadorPorEmpresa: new Map(),
    coordenadorPorGrupo: new Map(),
    tierPorEmpresa: new Map(),
    tierPorGrupo: new Map(),
  };
  for (const r of await registros(g.id)) {
    const nome = r.v[g.nome] || r.title;
    if (!nome || nome === "Rascunho") continue;
    const gestor = { nome, email: r.v[g.email]?.toLowerCase() || null };
    db.gestorPorRegistro.set(r.id, gestor);
    db.gestorPorNome.set(normalizar(nome), gestor);
  }
  log(`Equipe Comercial: ${db.gestorPorRegistro.size} gestores`);
  return db;
}

const RecZ = z.object({ table_record: z.object({ record_fields: z.array(z.object({ field: z.object({ id: z.string() }), value: z.string().nullable() })) }).nullable() });

/**
 * Registros da DB - BR NET ligados aos cards pelo conector da empresa ([NEW] Informar a empresa, Selecione a empresa do BRNET).
 * Dão o empresa_name e o group_name exibidos no painel, e o gestor e o tier com prioridade sobre o card.
 */
export async function carregarRegistrosBrnet(db: Databases, cards: CardCru[]) {
  const b = TABELAS.brnet;
  const ids = [...new Set(cards.map(idRegistroBrnet).filter((x): x is string => !!x))];
  db.brnetPorRegistro ??= new Map();
  await emParalelo(ids, 6, async (id) => {
    const r = RecZ.parse(await gql(`query($id: ID!) { table_record(id: $id) { record_fields { field { id } value } } }`, { id }));
    if (!r.table_record) return;
    const v = Object.fromEntries(r.table_record.record_fields.map((f) => [f.field.id, f.value?.trim() ?? ""]));
    const reg: RegistroBrnet = { empresa: v[b.empresa] ?? "", grupo: v[b.grupo] ?? "", coordenador: v[b.gestor] || null, tier: v[b.tier] || null };
    db.brnetPorRegistro!.set(id, reg);
  });
  log(`DB - BR NET: ${db.brnetPorRegistro.size} de ${ids.length} registros ligados aos cards`);
}

const FindZ = z.object({
  findRecords: z.object({
    edges: z.array(z.object({ node: z.object({ fields: z.array(z.object({ field: z.object({ id: z.string() }), value: z.string().nullable() })) }) })),
  }),
});

/** Registros da DB - BR NET com `campo` = `valor` (até `n`), cada um como mapa campo → valor. */
async function registrosNaBrnet(campo: string, valor: string, n: number): Promise<Record<string, string>[]> {
  const r = FindZ.parse(
    await gql(
      `query($t: String!, $f: String!, $v: String!, $n: Int!) { findRecords(tableId: $t, search: { fieldId: $f, fieldValue: $v }, first: $n) {
        edges { node { fields { field { id } value } } }
      } }`,
      { t: TABELAS.brnet.id, f: campo, v: valor, n },
    ),
  );
  return r.findRecords.edges.map((e) => Object.fromEntries(e.node.fields.map((c) => [c.field.id, c.value?.trim() ?? ""])));
}

/** O valor mais frequente entre os preenchidos (empate: o que aparece primeiro). */
export function maisComum(valores: (string | undefined)[]): string | null {
  const conta = new Map<string, number>();
  for (const v of valores) if (v) conta.set(v, (conta.get(v) ?? 0) + 1);
  let melhor: string | null = null;
  for (const [v, n] of conta) if (!melhor || n > conta.get(melhor)!) melhor = v;
  return melhor;
}

/** O que a DB - BR NET diz de uma empresa. Empresa não encontrada fica com os dois campos nulos. */
export type EmpresaBrnet = { empresa: string; coordenador: string | null; tier: string | null };

/** Guarda as consultas por empresa entre execuções; `ler` devolve só as que ainda valem. */
export interface CacheBrnet {
  ler(empresas: string[]): Promise<EmpresaBrnet[]>;
  gravar(consultadas: EmpresaBrnet[]): Promise<void>;
}

/**
 * Busca na DB - BR NET o tier e o gestor de cada empresa dos itens (as que estão no cache não são consultadas)
 * e, para os itens sem gestor cuja empresa não resolveu, o gestor do grupo.
 */
export async function completarBrnet(
  db: Databases,
  itens: { empresa: string; grupo: string }[],
  cache?: CacheBrnet,
) {
  const b = TABELAS.brnet;
  const aplicar = (e: EmpresaBrnet) => {
    if (e.coordenador) db.coordenadorPorEmpresa.set(normalizar(e.empresa), e.coordenador);
    if (e.tier) db.tierPorEmpresa.set(normalizar(e.empresa), e.tier);
  };

  const empresas = [...new Set(itens.map((x) => x.empresa).filter(Boolean))];
  const doCache = (await cache?.ler(empresas)) ?? [];
  doCache.forEach(aplicar);
  const conhecidas = new Set(doCache.map((e) => normalizar(e.empresa)));
  const faltam = empresas.filter((e) => !conhecidas.has(normalizar(e)));

  const consultadas = await emParalelo(faltam, 6, async (empresa): Promise<EmpresaBrnet> => {
    // a mesma empresa pode ter mais de um registro, nem todos com gestor e tier preenchidos
    const rs = await registrosNaBrnet(b.empresa, empresa, 5);
    return { empresa, coordenador: rs.map((r) => r[b.gestor]).find(Boolean) || null, tier: rs.map((r) => r[b.tier]).find(Boolean) || null };
  });
  consultadas.forEach(aplicar);
  if (consultadas.length) await cache?.gravar(consultadas);

  // o gestor da DB - BR NET vale mais que o do card: todo item cuja empresa não trouxe gestor ou tier procura pelo grupo,
  // ficando com o gestor e o tier mais frequentes entre as empresas do grupo
  const incompleta = (x: { empresa: string }) => !db.coordenadorPorEmpresa.has(normalizar(x.empresa)) || !db.tierPorEmpresa.has(normalizar(x.empresa));
  const grupos = [...new Set(itens.filter(incompleta).map((x) => x.grupo).filter(Boolean))].filter(
    (g) => !db.coordenadorPorGrupo.has(normalizar(g)) || !db.tierPorGrupo.has(normalizar(g)),
  );
  await emParalelo(grupos, 4, async (g) => {
    const rs = await registrosNaBrnet(b.grupo, g, 50);
    const c = maisComum(rs.map((r) => r[b.gestor]));
    const t = maisComum(rs.map((r) => r[b.tier]));
    if (c) db.coordenadorPorGrupo.set(normalizar(g), c);
    if (t) db.tierPorGrupo.set(normalizar(g), t);
  });
  log(`DB - BR NET: ${doCache.length} empresas do cache, ${faltam.length} empresas e ${grupos.length} grupos consultados`);
}
