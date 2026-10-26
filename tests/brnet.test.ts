import { afterEach, describe, expect, it, vi } from "vitest";
import { completarBrnet, maisComum, semRepetidos, type CacheBrnet, type EmpresaBrnet } from "../jobs/pipefy";
import { card, databases } from "./fixtures/cards";

afterEach(() => vi.unstubAllGlobals());

const resposta = (fields: Record<string, string>) =>
  new Response(JSON.stringify({ data: { findRecords: { edges: [{ node: { fields: Object.entries(fields).map(([id, value]) => ({ field: { id }, value })) } }] } } }));

describe("completarBrnet com cache", () => {
  it("empresa no cache não é consultada no Pipefy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("não devia consultar"))));
    const cache: CacheBrnet = {
      ler: async () => [{ empresa: "Acme Ltda", coordenador: "Karen Exemplo", tier: "Diamante" }],
      gravar: vi.fn(),
    };
    const db = databases();
    await completarBrnet(db, [{ empresa: "ACME LTDA", grupo: "G" }], cache);
    expect(db.tierPorEmpresa.get("acme ltda")).toBe("Diamante");
    expect(cache.gravar).not.toHaveBeenCalled();
  });

  it("consulta só as que faltam e grava o resultado, inclusive a não encontrada", async () => {
    process.env.PIPEFY_TOKEN ||= "teste";
    const fetch = vi.fn(async (_u: string, init: { body: string }) =>
      JSON.parse(init.body).variables.v === "Nova SA"
        ? resposta({ tier: "Prata", account_coordinator_name: "Patrícia Exemplo" })
        : new Response(JSON.stringify({ data: { findRecords: { edges: [] } } })),
    );
    vi.stubGlobal("fetch", fetch);
    let gravadas: EmpresaBrnet[] = [];
    const cache: CacheBrnet = {
      ler: async () => [{ empresa: "Acme Ltda", coordenador: null, tier: "Ouro" }],
      gravar: async (c) => void (gravadas = c),
    };
    const com = (empresa: string) => ({ empresa, grupo: "" });
    const db = databases();
    await completarBrnet(db, [com("Acme Ltda"), com("Nova SA"), com("Sumida ME")], cache);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(db.tierPorEmpresa.get("nova sa")).toBe("Prata");
    expect(gravadas).toEqual([
      { empresa: "Nova SA", coordenador: "Patrícia Exemplo", tier: "Prata" },
      { empresa: "Sumida ME", coordenador: null, tier: null },
    ]);
  });
});

describe("completarBrnet pelo grupo", () => {
  it("empresa com gestor e tier vazios fica com os mais frequentes do grupo", async () => {
    process.env.PIPEFY_TOKEN ||= "teste";
    const registros = (rs: Record<string, string>[]) =>
      new Response(JSON.stringify({ data: { findRecords: { edges: rs.map((f) => ({ node: { fields: Object.entries(f).map(([id, value]) => ({ field: { id }, value })) } })) } } }));
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      const { f } = JSON.parse(init.body).variables;
      return f === "group_name"
        ? registros([
            { account_coordinator_name: "", tier: "Prata" },
            { account_coordinator_name: "Marcela Exemplo", tier: "Prata" },
            { account_coordinator_name: "Marcela Exemplo", tier: "Ouro" },
          ])
        : registros([{ account_coordinator_name: "", tier: "" }]);
    }));
    const db = databases();
    await completarBrnet(db, [{ empresa: "Filial X", grupo: "Grupo X" }]);
    expect(db.coordenadorPorGrupo.get("grupo x")).toBe("Marcela Exemplo");
    expect(db.tierPorGrupo.get("grupo x")).toBe("Prata");
  });

  it("maisComum ignora vazios e desempata pelo primeiro", () => {
    expect(maisComum(["", "B", "A", "A", "B"])).toBe("B");
    expect(maisComum(["", undefined])).toBeNull();
  });
});

describe("semRepetidos", () => {
  it("card lido em duas fases fica uma vez só", () => {
    const a = card({}, { id: "1", fase: { id: "f1", nome: "Fase 1" } });
    const b = card({}, { id: "2" });
    const aDeNovo = card({}, { id: "1", fase: { id: "f2", nome: "Fase 2" } });
    expect(semRepetidos([a, b, aDeNovo]).map((c) => [c.id, c.fase.id])).toEqual([["1", "f1"], ["2", b.fase.id]]);
  });
});
