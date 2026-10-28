// Coleta do Radar: busca notícias, posts e vagas públicas do LinkedIn de um grupo via Serper (Google Search API).
import { exigir } from "./env";
import { dataLinkedin, dataRelativa, type ItemColetado } from "./radar-regras";
import type { Dia } from "./regras";

const SERPER = "https://google.serper.dev";

type Resultado = { title?: string; link?: string; snippet?: string; date?: string; source?: string };

async function serper(endpoint: "news" | "search", q: string, tbs: string): Promise<Resultado[]> {
  const r = await fetch(`${SERPER}/${endpoint}`, {
    method: "POST",
    headers: { "X-API-KEY": exigir("SERPER_API_KEY"), "Content-Type": "application/json" },
    // num 10: o Serper recusa (400) valores maiores no plano básico
    body: JSON.stringify({ q, gl: "br", hl: "pt-br", num: 10, tbs }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Serper ${endpoint} respondeu ${r.status} para "${q}"`);
  const j = (await r.json()) as { news?: Resultado[]; organic?: Resultado[] };
  return j.news ?? j.organic ?? [];
}

const veiculoDe = (url: string, source?: string) => {
  if (source) return source;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * Três buscas por termo: notícias, posts e vagas do LinkedIn. `janela` é o filtro de tempo do Google
 * (d = 24 h, w = 7 dias, m = 30 dias).
 */
export async function coletar(termos: string[], hoje: Dia, janela: "d" | "w" | "m"): Promise<{ itens: ItemColetado[]; consultas: number }> {
  const tbs = `qdr:${janela}`;
  const itens: ItemColetado[] = [];
  let consultas = 0;
  for (const termo of termos) {
    const t = `"${termo.replace(/"/g, "")}"`;
    const [noticias, posts, vagas] = await Promise.all([
      serper("news", t, tbs),
      serper("search", `site:linkedin.com/posts ${t}`, tbs),
      serper("search", `site:linkedin.com/jobs ${t} Brasil`, tbs),
    ]);
    consultas += 3;
    for (const x of noticias) {
      if (!x.link || !x.title) continue;
      itens.push({ origem: "noticia", veiculo: veiculoDe(x.link, x.source), titulo: x.title, trecho: x.snippet ?? "", url: x.link, data: dataRelativa(x.date, hoje) });
    }
    for (const x of [...posts, ...vagas]) {
      if (!x.link || !x.title || !/linkedin\.com\/(posts|jobs)\//.test(x.link)) continue;
      itens.push({
        origem: "linkedin",
        veiculo: "LinkedIn",
        titulo: x.title,
        trecho: x.snippet ?? "",
        url: x.link,
        data: dataLinkedin(x.link) ?? dataRelativa(x.date, hoje),
      });
    }
  }
  return { itens, consultas };
}
