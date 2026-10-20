import { describe, expect, it } from "vitest";
import {
  DataInvalida,
  DEMANDA_SEM_TIPO,
  diaDoCampo,
  hojeEmSP,
  itensDoCard,
  parseDia,
  prazoDaArea,
  resolverGestor,
  resolverTier,
  somarDias,
  statusDoPrazo,
} from "../jobs/regras";
import { card, cardReal, checklistOk, checklistVazio, databases, dt, vazio } from "./fixtures/cards";

describe("parseDia", () => {
  it.each([
    ["14/02/2025", "2025-02-14"],
    ["14/02/2025 15:24", "2025-02-14"],
    ["4/2/2025 00:00:00", "2025-02-04"],
    ["2025-02-14", "2025-02-14"],
    ["2025-02-14T23:59:00", "2025-02-14"], // sem fuso = hora local de SP
    ["2025-02-14T18:24:07+00:00", "2025-02-14"],
    ["2025-02-15T01:30:00Z", "2025-02-14"], // 22:30 em SP ainda é dia 14
    ["2025-02-15T03:00:00Z", "2025-02-15"],
    ["2025-02-14T23:30:00-03:00", "2025-02-14"],
  ])("%s → %s", (txt, esperado) => expect(parseDia(txt)).toBe(esperado));

  it("vazio é null", () => {
    expect(parseDia("")).toBeNull();
    expect(parseDia("  ")).toBeNull();
    expect(parseDia(null)).toBeNull();
  });

  it.each(["31/02/2025", "2025-13-01", "amanhã", "14-02-2025"])("%s é inválido", (txt) =>
    expect(parseDia(txt)).toBeUndefined(),
  );
});

describe("diaDoCampo", () => {
  it("usa datetime_value convertido para SP antes do value", () => {
    // 22:30 de SP no dia 14 = 01:30Z do dia 15
    expect(diaDoCampo("x", dt("2025-02-15T01:30:00Z"))).toBe("2025-02-14");
  });

  it("cai para o value quando não há datetime_value nem date_value", () => {
    expect(diaDoCampo("x", { value: "03/10/2026 10:00" })).toBe("2026-10-03");
  });

  it("aceita se ao menos uma representação for válida", () => {
    expect(diaDoCampo("x", { datetime_value: "lixo", date_value: "2026-10-03" })).toBe("2026-10-03");
  });

  it("lança DataInvalida quando nada é data", () => {
    expect(() => diaDoCampo("prazo_x", { value: "a combinar" })).toThrow(DataInvalida);
  });

  it("campo ausente ou vazio é null", () => {
    expect(diaDoCampo("x", undefined)).toBeNull();
    expect(diaDoCampo("x", vazio)).toBeNull();
  });
});

describe("hojeEmSP (virada de dia)", () => {
  it("antes das 03:00 UTC ainda é o dia anterior em SP", () => {
    expect(hojeEmSP(new Date("2026-10-20T02:59:59Z"))).toBe("2026-10-19");
    expect(hojeEmSP(new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-20");
  });

  it("horários dos agendamentos caem no dia certo", () => {
    expect(hojeEmSP(new Date("2026-10-20T09:45:00Z"))).toBe("2026-10-20"); // manhã
    expect(hojeEmSP(new Date("2026-10-20T20:45:00Z"))).toBe("2026-10-20"); // tarde
  });
});

describe("statusDoPrazo", () => {
  const hoje = "2026-10-20";
  it.each([
    ["2026-10-13", "Atrasado", 7],
    ["2026-10-19", "Atrasado", 1],
    ["2026-10-20", "Próximo do vencimento", 0],
    ["2026-10-21", "No radar (até D+2)", 0],
    ["2026-10-22", "No radar (até D+2)", 0],
  ])("prazo %s → %s", (prazo, status, dias) =>
    expect(statusDoPrazo(prazo, hoje)).toEqual({ status, dias_atraso: dias }),
  );

  it("D+3 não entra", () => expect(statusDoPrazo("2026-10-23", hoje)).toBeNull());

  it("D+2 atravessando o mês", () => {
    expect(statusDoPrazo("2026-11-02", "2026-10-31")?.status).toBe("No radar (até D+2)");
    expect(statusDoPrazo("2026-11-03", "2026-10-31")).toBeNull();
    expect(somarDias("2026-12-31", 2)).toBe("2027-01-02");
  });

  it("atraso atravessando o ano", () => {
    expect(statusDoPrazo("2025-12-30", "2026-01-02")).toEqual({ status: "Atrasado", dias_atraso: 3 });
  });
});

describe("prazo de Segurança (ST)", () => {
  it("é o maior entre os dois campos", () => {
    const c = card({
      prazo_de_entrega_p_s_visita: dt("2026-10-25T15:00:00Z"),
      prazo_seguran_a_do_trabalho: dt("2026-10-20T15:00:00Z"),
    });
    expect(prazoDaArea(c, "ST")).toEqual({ prazo: "2026-10-25", campo: "prazo_de_entrega_p_s_visita" });
  });

  it("só um preenchido: usa ele", () => {
    const c = card({ prazo_de_entrega_p_s_visita: vazio, prazo_seguran_a_do_trabalho: dt("2026-10-20T15:00:00Z") });
    expect(prazoDaArea(c, "ST")).toEqual({ prazo: "2026-10-20", campo: "prazo_seguran_a_do_trabalho" });
  });

  it("nenhum preenchido: sem item", () => {
    expect(prazoDaArea(card({ prazo_de_entrega_p_s_visita: vazio }), "ST")).toBeNull();
  });

  it("ignora prazo_st e Prazo Segurança do Trabalho (ST)", () => {
    const c = card({
      prazo_st: dt("2026-10-20T15:00:00Z"),
      prazo_seguran_a_do_trabalho_st: dt("2026-10-20T15:00:00Z"),
    });
    expect(prazoDaArea(c, "ST")).toBeNull();
  });

  it("empate fica com o primeiro campo da regra", () => {
    const c = card({
      prazo_de_entrega_p_s_visita: dt("2026-10-20T12:00:00Z"),
      prazo_seguran_a_do_trabalho: dt("2026-10-20T18:00:00Z"),
    });
    expect(prazoDaArea(c, "ST")?.campo).toBe("prazo_de_entrega_p_s_visita");
  });
});

describe("prazo de Saúde (SO)", () => {
  const so = dt("2026-10-21T15:00:00Z");
  const prazoSo = dt("2026-10-22T15:00:00Z");
  const ra = dt("2026-10-19T15:00:00Z");

  it("sem Relatório Anual: maior entre Prazo Saúde Ocupacional e Prazo (SO)", () => {
    const c = card({ prazo_sa_de_ocupacional: so, prazo_so: prazoSo, relat_rio_anual_oculto: checklistVazio });
    expect(prazoDaArea(c, "SO")).toEqual({ prazo: "2026-10-22", campo: "prazo_so" });
  });

  it("só Prazo Saúde Ocupacional preenchido", () => {
    expect(prazoDaArea(card({ prazo_sa_de_ocupacional: so }), "SO")).toEqual({
      prazo: "2026-10-21",
      campo: "prazo_sa_de_ocupacional",
    });
  });

  it("com Prazo Relatório Anual: ele vale, mesmo se os outros forem maiores", () => {
    const c = card({ prazo_relat_rio_anual_1: ra, prazo_sa_de_ocupacional: so, prazo_so: prazoSo });
    expect(prazoDaArea(c, "SO")).toEqual({ prazo: "2026-10-19", campo: "prazo_relat_rio_anual_1" });
  });

  it("com Relatório Anual (Oculto) e Prazo Relatório Anual: vale o Prazo Relatório Anual", () => {
    const c = card({ relat_rio_anual_oculto: checklistOk, prazo_relat_rio_anual_1: ra, prazo_so: prazoSo });
    expect(prazoDaArea(c, "SO")?.campo).toBe("prazo_relat_rio_anual_1");
  });

  it("só o Oculto marcado: Prazo Relatório Anual vazio → sem item, mesmo com outros prazos (como na DAX)", () => {
    const c = card({ relat_rio_anual_oculto: checklistOk, prazo_relat_rio_anual_1: vazio, prazo_sa_de_ocupacional: so });
    expect(prazoDaArea(c, "SO")).toBeNull();
  });

  it("Oculto preenchido só pelo value (sem array_value) também conta", () => {
    const c = card({ relat_rio_anual_oculto: { value: '["OK"]' }, prazo_sa_de_ocupacional: so });
    expect(prazoDaArea(c, "SO")).toBeNull();
  });
});

describe("prazo de On-Going (OG)", () => {
  it("é o maior entre Manutenção BR NET e Manutenção BR NET (OP)", () => {
    const c = card({
      prazo_manuten_o_br_net: dt("2026-10-20T15:00:00Z"),
      prazo_manuten_o_br_net_op: dt("2026-10-21T15:00:00Z"),
    });
    expect(prazoDaArea(c, "OG")).toEqual({ prazo: "2026-10-21", campo: "prazo_manuten_o_br_net_op" });
  });

  it("só OP preenchido", () => {
    const c = card({ prazo_manuten_o_br_net: vazio, prazo_manuten_o_br_net_op: dt("2026-10-21T15:00:00Z") });
    expect(prazoDaArea(c, "OG")?.campo).toBe("prazo_manuten_o_br_net_op");
  });
});

describe("itensDoCard", () => {
  const db = databases();

  it("card real: ST atrasado, SO no radar, OG fora da janela", () => {
    const itens = itensDoCard(cardReal, "2025-02-12", db);
    expect(itens.map((i) => [i.item_id, i.status, i.dias_atraso, i.prazo])).toEqual([
      ["1072838822-ST", "Atrasado", 1, "2025-02-11"],
      ["1072838822-SO", "No radar (até D+2)", 0, "2025-02-14"],
    ]);
    expect(itens[0]).toMatchObject({
      card_id: "1072838822",
      demanda: "PGR/PCMSO",
      empresa: "EDIFICIO EXEMPLO",
      grupo: "GRUPO EXEMPLO",
      gestor_nome: "Flávia Exemplo",
      gestor_email: "flavia.exemplo@grupobrmed.com.br",
      campo_prazo: "prazo_seguran_a_do_trabalho",
      fase_id: "315003836",
      fase_nome: "Aguardando Retorno do Cliente",
      link: "https://app.pipefy.com/open-cards/1072838822",
    });
  });

  it("card em fase excluída não gera item", () => {
    for (const fase of ["315003811", "322203966", "315003828"]) {
      expect(itensDoCard({ ...cardReal, fase: { id: fase, nome: "x" } }, "2025-02-12", db)).toEqual([]);
    }
  });

  it("prazo com texto inválido lança DataInvalida (o job registra e ignora o card)", () => {
    const c = card({ prazo_seguran_a_do_trabalho: { value: "a definir" } });
    expect(() => itensDoCard(c, "2026-10-20", db)).toThrow(DataInvalida);
  });

  it("sem tipo de documento usa o texto padrão", () => {
    const c = card({ tipo_de_documento: vazio, prazo_seguran_a_do_trabalho: dt("2026-10-20T15:00:00Z") });
    expect(itensDoCard(c, "2026-10-20", db)[0].demanda).toBe(DEMANDA_SEM_TIPO);
  });
});

describe("resolverTier", () => {
  const db = databases();
  const tierNoCard = { new_informar_o_tier_que_pertence_o_cliente_formul_rio_inicial: { value: "Prata" } };

  it("vem da DB - BR NET pela empresa, mesmo com o campo do card preenchido", () => {
    expect(resolverTier(card(tierNoCard), db, "Edifício  Exemplo")).toBe("Ouro");
  });

  it("empresa fora da DB - BR NET: usa o campo [NEW] do card", () => {
    expect(resolverTier(card(tierNoCard), db, "OUTRA EMPRESA")).toBe("Prata");
  });

  it("ignora o campo de tier do esquema antigo", () => {
    expect(resolverTier(card({ informar_o_tier_que_pertence_o_cliente: { value: "Tier 1" } }), db, "OUTRA EMPRESA")).toBeNull();
  });

  it("o item leva o tier", () => {
    const itens = itensDoCard(cardReal, "2025-02-14", db);
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((i) => i.tier === "Ouro")).toBe(true);
  });
});

describe("resolverGestor", () => {
  const db = databases();
  const semGestor = { value: "[]", array_value: [], connectedRepoItems: [] };

  it("pelo registro conectado no card", () => {
    expect(resolverGestor(card({}), db, "", "")).toEqual({
      nome: "Flávia Exemplo",
      email: "flavia.exemplo@grupobrmed.com.br",
    });
  });

  it("pelo nome, ignorando acento, quando o registro não está na database", () => {
    const c = card({
      informar_o_respons_vel_pela_sua_conta_na_br_med_restored: {
        value: '["Patricia  Exemplo"]',
        connectedRepoItems: [{ id: "999", title: "Patricia  Exemplo" }],
      },
    });
    expect(resolverGestor(c, db, "", "").email).toBe("patricia.exemplo@grupobrmed.com.br");
  });

  it("sem gestor no card: procura a empresa na DB - BR NET", () => {
    const c = card({ informar_o_respons_vel_pela_sua_conta_na_br_med_restored: semGestor });
    expect(resolverGestor(c, db, "Empresa da Base", "outro")).toEqual({
      nome: "Patrícia Exemplo",
      email: "patricia.exemplo@grupobrmed.com.br",
    });
  });

  it("depois o grupo; nome sem e-mail na Equipe Comercial fica sem e-mail", () => {
    const c = card({ informar_o_respons_vel_pela_sua_conta_na_br_med_restored: semGestor });
    expect(resolverGestor(c, db, "desconhecida", "GRUPO DA BASE")).toEqual({ nome: "Karen Exemplo", email: null });
  });

  it("sem nenhuma fonte: nome e e-mail nulos", () => {
    const c = card({ informar_o_respons_vel_pela_sua_conta_na_br_med_restored: semGestor });
    expect(resolverGestor(c, db, "x", "y")).toEqual({ nome: null, email: null });
  });
});
