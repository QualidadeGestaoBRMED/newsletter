// Regras puras do Radar de clientes (sem rede nem banco), para testar isoladas.
import { createHash } from "node:crypto";
import { diasEntre, somarDias, type Dia } from "./regras";

/** Tiers monitorados por padrão. RADAR_TIERS (separados por vírgula) troca a lista. */
export const TIERS_RADAR_PADRAO = ["Diamante", "Ouro"];

// Dias da semana (0 = domingo) em que cada tier é coletado. Tier fora daqui: só às segundas.
const FREQUENCIA: Record<string, number[]> = {
  Diamante: [1, 2, 3, 4, 5],
  Ouro: [1, 3, 5],
  Prata: [1, 4],
};

export const tiersMonitorados = (v = process.env.RADAR_TIERS ?? "") => {
  const lista = v.split(",").map((t) => t.trim()).filter(Boolean);
  return lista.length ? lista : TIERS_RADAR_PADRAO;
};

/** O grupo é coletado neste dia da semana? */
export const coletaHoje = (tier: string | null, diaSemana: number) => (FREQUENCIA[tier ?? ""] ?? [1]).includes(diaSemana);

/** Item coletado de uma busca (notícia, post ou página de vagas do LinkedIn). */
export type ItemColetado = {
  origem: "noticia" | "linkedin";
  veiculo: string;
  titulo: string;
  trecho: string;
  url: string;
  data: Dia | null;
};

const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

/**
 * Data de publicação a partir do texto que a busca devolve: "há 19 horas", "5 dias atrás", "1 semana atrás",
 * "2 days ago", "28 de out. de 2026", "Oct 9, 2026". Sem data reconhecível, null.
 */
export function dataRelativa(txt: string | undefined, hoje: Dia): Dia | null {
  if (!txt) return null;
  const s = txt.toLowerCase().trim();
  const rel = s.match(/(\d+)\s*(minuto|hora|dia|semana|m[eê]s|mes|minute|hour|day|week|month)/);
  if (rel && /(atr[aá]s|^h[aá]\s|ago)/.test(s)) {
    const n = +rel[1];
    const u = rel[2];
    if (/minut|hora|hour/.test(u)) return n >= 24 ? somarDias(hoje, -Math.floor(n / 24)) : hoje;
    if (/^(dia|day)/.test(u)) return somarDias(hoje, -n);
    if (/semana|week/.test(u)) return somarDias(hoje, -7 * n);
    return somarDias(hoje, -30 * n); // mês: aproximado, só serve para a seção do jornal
  }
  const pt = s.match(/(\d{1,2}) de ([a-zç]{3})[a-zç.]* de (\d{4})/);
  if (pt && MESES[pt[2]]) return iso(+pt[3], MESES[pt[2]], +pt[1]);
  const en = s.match(/([a-z]{3})[a-z]* (\d{1,2}), (\d{4})/);
  if (en && MESES[en[1]]) return iso(+en[3], MESES[en[1]], +en[2]);
  const br = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return iso(+br[3], +br[2], +br[1]);
  return null;
}

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Posts do LinkedIn trazem a data no id ("activity-<19 dígitos>"): os 41 bits altos são o instante em ms. */
export function dataLinkedin(url: string): Dia | null {
  const m = url.match(/activity[-:](\d{19})/);
  if (!m) return null;
  const ms = Number(BigInt(m[1]) >> 22n);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Id estável do sinal: o mesmo grupo e a mesma fonte principal dão o mesmo id em coletas diferentes. */
export const idSinal = (grupo: string, url: string) => createHash("sha1").update(`${grupo}\n${url}`).digest("hex").slice(0, 20);

/** Tira o que cita um termo excluído (homônimos) e repete URL. */
export function filtrarItens(itens: ItemColetado[], exclusoes: string[]): ItemColetado[] {
  const ex = exclusoes.map((e) => e.toLowerCase()).filter(Boolean);
  const vistos = new Set<string>();
  return itens.filter((i) => {
    const texto = `${i.titulo} ${i.trecho}`.toLowerCase();
    if (ex.some((e) => texto.includes(e)) || vistos.has(i.url)) return false;
    vistos.add(i.url);
    return true;
  });
}

/** Item mais antigo que a janela (por data conhecida) não entra: a busca às vezes devolve matéria velha como nova. */
export const dentroDaJanela = (i: ItemColetado, hoje: Dia, dias: number) => !i.data || diasEntre(i.data, hoje) <= dias;
