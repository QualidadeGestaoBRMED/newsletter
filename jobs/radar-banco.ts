// Banco do Radar: de onde vêm os grupos monitorados e onde os sinais ficam.
import "./env";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db, pool, schema } from "../db";
import type { RadarEmail } from "../emails/NewsletterGestor";
import { ordenarSinais, TIERS_RADAR, type Sinal } from "../lib/radar";
import { idSinal, type ItemColetado } from "./radar-regras";
import type { SinalTriado } from "./radar-triagem";
import { somarDias, type Dia } from "./regras";

export type GrupoRadar = {
  nome: string;
  tier: string | null;
  gestor_nome: string | null;
  gestor_email: string | null;
  unidades: string[];
  termos: string[];
  exclusoes: string[];
};

const LOTE = 1000;

/**
 * Grupos com demanda nas edições dos últimos `dias` dias. Gestor e tier vêm da edição mais recente em que o grupo aparece;
 * as empresas viram a lista de unidades que a BR MED atende (a IA usa para cruzar a notícia com a nossa base).
 */
export async function gruposMonitorados(hoje: Dia, dias = 30): Promise<GrupoRadar[]> {
  const i = schema.itensEdicao;
  const desde = somarDias(hoje, -dias);
  const linhas = await db
    .select({ grupo: i.grupo, empresa: i.empresa, tier: i.tier, gestor_nome: i.gestor_nome, gestor_email: i.gestor_email, edicao: i.edicao_id })
    .from(i)
    .where(gte(i.edicao_id, desde))
    .orderBy(desc(i.edicao_id));

  const perfis = new Map((await db.select().from(schema.radarPerfis)).map((p) => [p.grupo, p]));
  const grupos = new Map<string, GrupoRadar>();
  for (const l of linhas) {
    if (!l.grupo) continue;
    let g = grupos.get(l.grupo);
    if (!g) {
      const p = perfis.get(l.grupo);
      if (p && !p.ativo) continue;
      // primeira linha = edição mais recente (ordem desc)
      g = { nome: l.grupo, tier: l.tier, gestor_nome: l.gestor_nome, gestor_email: l.gestor_email, unidades: [], termos: p?.termos.length ? p.termos : [l.grupo], exclusoes: p?.exclusoes ?? [] };
      grupos.set(l.grupo, g);
    }
    if (l.empresa && !g.unidades.includes(l.empresa)) g.unidades.push(l.empresa);
  }
  return [...grupos.values()];
}

/** URLs que já passaram pela triagem deste grupo. */
export async function jaVistos(grupo: string, urls: string[]): Promise<Set<string>> {
  const v = schema.radarVistos;
  const out = new Set<string>();
  for (let k = 0; k < urls.length; k += LOTE) {
    const r = await db
      .select({ url: v.url })
      .from(v)
      .where(and(eq(v.grupo, grupo), inArray(v.url, urls.slice(k, k + LOTE))));
    r.forEach((x) => out.add(x.url));
  }
  return out;
}

/** Grava os sinais do grupo e marca todas as URLs triadas como vistas (inclusive as descartadas). */
export async function gravarSinais(g: GrupoRadar, itens: ItemColetado[], sinais: SinalTriado[]) {
  await db.transaction(async (tx) => {
    for (const s of sinais) {
      const fontes = s.fontes.map((k) => ({ veiculo: itens[k].veiculo, titulo: itens[k].titulo, url: itens[k].url, data: itens[k].data }));
      const valores = {
        id: idSinal(g.nome, fontes[0].url),
        grupo: g.nome,
        tier: g.tier,
        gestor_nome: g.gestor_nome,
        gestor_email: g.gestor_email,
        titulo: s.titulo,
        resumo: s.resumo,
        proximo_passo: s.proximo_passo,
        tipo: s.tipo,
        prioridade: s.prioridade,
        publicado_em: /^\d{4}-\d{2}-\d{2}$/.test(s.publicado_em ?? "") ? s.publicado_em : null,
        fontes,
      };
      await tx.insert(schema.radarSinais).values(valores).onConflictDoNothing();
    }
    if (itens.length) {
      await tx
        .insert(schema.radarVistos)
        .values(itens.map((i) => ({ grupo: g.nome, url: i.url })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Bloco do Radar no e-mail do gestor: o que entrou na carteira desde `desde` (a edição anterior), sem as notas de contexto.
 * Até 3 manchetes, na ordem do jornal (pede ação, tier, mais recente). Sem notícia nova, null.
 */
export async function radarDaCarteira(gestor: string, desde: Date, link: string): Promise<RadarEmail | null> {
  const s = schema.radarSinais;
  const rows = await db
    .select()
    .from(s)
    .where(and(eq(s.gestor_nome, gestor), gte(s.coletado_em, desde), inArray(s.tier, TIERS_RADAR), ne(s.prioridade, "contexto")));
  if (!rows.length) return null;
  const sinais: Sinal[] = rows.map((x) => ({ ...x, gestor: x.gestor_nome, coletado_em: x.coletado_em.toISOString() }));
  const ord = ordenarSinais(sinais, TIERS_RADAR);
  // cada manchete abre a página do cliente no Radar
  const doCliente = (grupo: string) => {
    const u = new URL(link);
    u.searchParams.set("grupo", grupo);
    return u.toString();
  };
  return {
    novas: ord.length,
    agir: ord.filter((x) => x.prioridade === "agir").length,
    itens: ord.slice(0, 3).map((x) => ({ grupo: x.grupo, tier: x.tier, titulo: x.titulo, agir: x.prioridade === "agir", link: doCliente(x.grupo) })),
    link,
  };
}

export const fecharBanco = () => pool.end();
