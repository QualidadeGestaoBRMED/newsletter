import { describe, expect, it } from "vitest";
import { manchete, ordenarSinais, periodoDe, type Sinal } from "../lib/radar";
import { coletaHoje, dataLinkedin, dataRelativa, dentroDaJanela, filtrarItens, idSinal, tiersMonitorados, type ItemColetado } from "../jobs/radar-regras";

const HOJE = "2026-10-28";

describe("dataRelativa", () => {
  it("entende os formatos do Google em português e inglês", () => {
    expect(dataRelativa("há 19 horas", HOJE)).toBe(HOJE);
    expect(dataRelativa("1 dia atrás", HOJE)).toBe("2026-10-27");
    expect(dataRelativa("5 dias atrás", HOJE)).toBe("2026-10-23");
    expect(dataRelativa("2 semanas atrás", HOJE)).toBe("2026-10-14");
    expect(dataRelativa("2 days ago", HOJE)).toBe("2026-10-26");
    expect(dataRelativa("28 de out. de 2026", HOJE)).toBe("2026-10-28");
    expect(dataRelativa("9 de set. de 2026", HOJE)).toBe("2026-09-09");
    expect(dataRelativa("Oct 9, 2026", HOJE)).toBe("2026-10-09");
  });
  it("devolve null sem data reconhecível", () => {
    expect(dataRelativa(undefined, HOJE)).toBeNull();
    expect(dataRelativa("Publicação de Empresa X", HOJE)).toBeNull();
  });
});

describe("dataLinkedin", () => {
  it("tira a data do id do post", () => {
    expect(dataLinkedin("https://www.linkedin.com/posts/x_y-activity-7519051053137539072-Czzc")).toBe("2026-10-22");
    expect(dataLinkedin("https://pt.linkedin.com/posts/empresa_x-activity-7510801548684201985-pkzY")).toBe("2026-09-29");
  });
  it("devolve null para link sem id de post", () => {
    expect(dataLinkedin("https://br.linkedin.com/jobs/empresa-vagas")).toBeNull();
  });
});

describe("frequência por tier", () => {
  it("Diamante todo dia útil, Ouro seg/qua/sex, demais só segunda", () => {
    expect([1, 2, 3, 4, 5].every((d) => coletaHoje("Diamante", d))).toBe(true);
    expect([1, 3, 5].map((d) => coletaHoje("Ouro", d))).toEqual([true, true, true]);
    expect(coletaHoje("Ouro", 2)).toBe(false);
    expect(coletaHoje("Bronze", 1)).toBe(true);
    expect(coletaHoje("Bronze", 3)).toBe(false);
    expect(coletaHoje(null, 1)).toBe(true);
  });
  it("RADAR_TIERS troca a lista padrão", () => {
    expect(tiersMonitorados("")).toEqual(["Diamante", "Ouro"]);
    expect(tiersMonitorados("Diamante, Prata")).toEqual(["Diamante", "Prata"]);
  });
});

const item = (url: string, titulo: string, data: string | null = null): ItemColetado => ({ origem: "noticia", veiculo: "x", titulo, trecho: "", url, data });

describe("filtros da coleta", () => {
  it("tira homônimos e URLs repetidas", () => {
    const v = filtrarItens([item("a", "Empresa X compra estaleiro"), item("a", "repetido"), item("b", "Homônimo Y")], ["homônimo y"]);
    expect(v.map((i) => i.url)).toEqual(["a"]);
  });
  it("descarta matéria velha que a busca devolve como nova", () => {
    expect(dentroDaJanela(item("a", "x", "2026-10-01"), HOJE, 8)).toBe(false);
    expect(dentroDaJanela(item("a", "x", "2026-10-25"), HOJE, 8)).toBe(true);
    expect(dentroDaJanela(item("a", "x"), HOJE, 8)).toBe(true);
  });
  it("id do sinal é estável por grupo e fonte", () => {
    expect(idSinal("CLIENTE A", "u")).toBe(idSinal("CLIENTE A", "u"));
    expect(idSinal("CLIENTE A", "u")).not.toBe(idSinal("CLIENTE B", "u"));
  });
});

const sinal = (id: string, prioridade: Sinal["prioridade"], tier: string, publicado_em: string): Sinal => ({
  id, grupo: id, tier, gestor: null, titulo: id, resumo: "", proximo_passo: "", tipo: "outro", prioridade, publicado_em,
  coletado_em: `${publicado_em}T09:00:00Z`, fontes: [{ veiculo: "x", titulo: "x", url: "u", data: null }],
});

describe("jornal", () => {
  it("separa por dia", () => {
    expect(periodoDe(sinal("a", "agir", "Ouro", HOJE), HOJE)).toBe("hoje");
    expect(periodoDe(sinal("a", "agir", "Ouro", "2026-10-27"), HOJE)).toBe("ontem");
    expect(periodoDe(sinal("a", "agir", "Ouro", "2026-10-23"), HOJE)).toBe("semana");
    expect(periodoDe(sinal("a", "agir", "Ouro", "2026-10-01"), HOJE)).toBe("antes");
  });
  it("ordena por prioridade, tier e data", () => {
    const v = [sinal("c", "acompanhar", "Diamante", HOJE), sinal("b", "agir", "Ouro", HOJE), sinal("a", "agir", "Diamante", "2026-10-20")];
    expect(ordenarSinais(v, ["Diamante", "Ouro"]).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("manchete é o 'agir' mais forte da semana; sem ele, o mais forte de todos", () => {
    const v = [sinal("velho", "agir", "Diamante", "2026-09-01"), sinal("novo", "agir", "Ouro", "2026-10-26"), sinal("ctx", "contexto", "Diamante", HOJE)];
    expect(manchete(v, ["Diamante", "Ouro"], HOJE)?.id).toBe("novo");
    expect(manchete([v[0], v[2]], ["Diamante", "Ouro"], HOJE)?.id).toBe("velho");
  });
});
