import { describe, expect, it } from "vitest";
import {
  DataInvalida,
  diaDoCampo,
  diasUteisAte,
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

  it("D+2 em dias úteis atravessando o mês", () => {
    // sexta 30/10: o radar cobre segunda 02/11 e terça 03/11; o fim de semana não conta
    expect(statusDoPrazo("2026-11-02", "2026-10-30")?.status).toBe("No radar (até D+2)");
    expect(statusDoPrazo("2026-11-03", "2026-10-30")?.status).toBe("No radar (até D+2)");
    expect(statusDoPrazo("2026-11-04", "2026-10-30")).toBeNull();
    expect(somarDias("2026-12-31", 2)).toBe("2027-01-02");
  });

  it("prazo no fim de semana conta como o próximo dia útil para o radar", () => {
    expect(statusDoPrazo("2026-11-01", "2026-10-30")?.status).toBe("No radar (até D+2)");
  });

  it("dias úteis entre duas datas", () => {
    expect(diasUteisAte("2026-10-30", "2026-11-03")).toBe(2);
    expect(diasUteisAte("2026-10-26", "2026-10-30")).toBe(4);
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

  it("sem Relatório Anual: só o Prazo Saúde Ocupacional; o Prazo (SO) não entra", () => {
    const c = card({ prazo_sa_de_ocupacional: so, prazo_so: prazoSo, relat_rio_anual_oculto: checklistVazio });
    expect(prazoDaArea(c, "SO")).toEqual({ prazo: "2026-10-21", campo: "prazo_sa_de_ocupacional" });
  });

  it("só Prazo Saúde Ocupacional preenchido", () => {
    expect(prazoDaArea(card({ prazo_sa_de_ocupacional: so }), "SO")).toEqual({
      prazo: "2026-10-21",
      campo: "prazo_sa_de_ocupacional",
    });
  });

  it("Prazo Relatório Anual sem o Oculto marcado: vale o Prazo Saúde Ocupacional", () => {
    const c = card({ prazo_relat_rio_anual_1: ra, prazo_sa_de_ocupacional: so });
    expect(prazoDaArea(c, "SO")).toEqual({ prazo: "2026-10-21", campo: "prazo_sa_de_ocupacional" });
  });

  it("com o Oculto marcado: maior data entre os dois campos de Prazo Relatório Anual", () => {
    const c = card({ relat_rio_anual_oculto: checklistOk, prazo_relat_rio_anual_1: ra, prazo_relat_rio_anual: dt("2026-10-23T15:00:00Z"), prazo_sa_de_ocupacional: so });
    expect(prazoDaArea(c, "SO")).toEqual({ prazo: "2026-10-23", campo: "prazo_relat_rio_anual" });
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

  const noPrazo = { prazo_seguran_a_do_trabalho: dt("2026-10-20T15:00:00Z") };

  it("sem tipo de documento não entra (demanda interna)", () => {
    expect(itensDoCard(card({ tipo_de_documento: vazio, ...noPrazo }), "2026-10-20", db)).toEqual([]);
  });

  it("card de Notify não entra", () => {
    for (const f of ["formulario_notify_cancelamento_de_inscri_o_oculto", "formulario_notify_inclus_o_de_regra_oculto"]) {
      expect(itensDoCard(card({ [f]: { value: "Sim" }, ...noPrazo }), "2026-10-20", db)).toEqual([]);
    }
  });

  it("card de alteração de prazo não entra, com ou sem acento", () => {
    for (const title of ["Alteração de prazo - EMPRESA X", "ALTERACAO DE PRAZO"]) {
      expect(itensDoCard(card(noPrazo, { title }), "2026-10-20", db)).toEqual([]);
    }
  });

  it("fases incluídas na revisão também não geram item", () => {
    for (const fase of ["329680114", "343120238", "323232905", "315003833", "315003834", "315621777", "316631510", "343155906"]) {
      expect(itensDoCard(card(noPrazo, { fase: { id: fase, nome: "x" } }), "2026-10-20", db)).toEqual([]);
    }
  });

  it("card de teste (no título, na empresa ou no grupo) não entra", () => {
    expect(itensDoCard(card(noPrazo, { title: "TESTE - PGR - Fulano" }), "2026-10-20", db)).toEqual([]);
    expect(itensDoCard(card({ ...noPrazo, nome_da_empresa_conforme_br_net: { value: "EMPRESA TESTE" } }), "2026-10-20", db)).toEqual([]);
    expect(itensDoCard(card({ ...noPrazo, grupo_econ_mico_conforme_br_net: { value: "BR MED - AMBIENTE TESTE" } }), "2026-10-20", db)).toEqual([]);
    // só a palavra inteira: "Testemunha" não é teste
    expect(itensDoCard(card(noPrazo, { title: "TESTEMUNHA LTDA" }), "2026-10-20", db)).toHaveLength(1);
  });

  it("card Rascunho não entra", () => {
    expect(itensDoCard(card(noPrazo, { title: "Rascunho" }), "2026-10-20", db)).toEqual([]);
  });

  it("card sem empresa e sem grupo não entra; com um dos dois, entra", () => {
    const sem = { nome_da_empresa_conforme_br_net: vazio, grupo_econ_mico_conforme_br_net: vazio };
    expect(itensDoCard(card({ ...noPrazo, ...sem }), "2026-10-20", db)).toEqual([]);
    expect(itensDoCard(card({ ...noPrazo, ...sem, grupo_econ_mico_conforme_br_net: { value: "GRUPO X" } }), "2026-10-20", db)).toHaveLength(1);
  });

  it("prazo anterior à criação do card não gera item daquela área", () => {
    const c = card({ ...noPrazo, prazo_sa_de_ocupacional: dt("2026-10-23T15:00:00Z") }, { criadoEm: "2026-10-21" });
    expect(itensDoCard(c, "2026-10-21", db).map((i) => i.area)).toEqual(["SO"]);
    // prazo no próprio dia da criação vale
    expect(itensDoCard(card(noPrazo, { criadoEm: "2026-10-20" }), "2026-10-20", db)).toHaveLength(1);
  });

  it("área que já passou pela fase de encerramento não gera item; as outras seguem", () => {
    const c = card({ ...noPrazo, prazo_sa_de_ocupacional: dt("2026-10-20T15:00:00Z") }, { fasesPassadas: ["315003816", "315003823"] });
    expect(itensDoCard(c, "2026-10-20", db).map((i) => i.area)).toEqual(["SO"]);
  });

  it("card parado na fase de encerramento da área também não gera item dela", () => {
    const c = card(noPrazo, { fase: { id: "315003823", nome: "Enviar Demandas para a Próxima Área (Segurança do Trabalho)" } });
    expect(itensDoCard(c, "2026-10-20", db)).toEqual([]);
  });

  it("empresa e grupo vêm do registro da DB - BR NET ligado ao card", () => {
    const comReg = { ...databases(), brnetPorRegistro: new Map([["777", { empresa: "EMPRESA NA BASE LTDA", grupo: "GRUPO NA BASE", coordenador: null, tier: null }]]) };
    const c = card({ ...noPrazo, new_informar_a_empresa_br_net: { value: '["x"]', connectedRepoItems: [{ id: "777", title: "x" }] } });
    expect(itensDoCard(c, "2026-10-20", comReg)[0]).toMatchObject({ empresa: "EMPRESA NA BASE LTDA", grupo: "GRUPO NA BASE" });
    // sem registro: os campos de texto do card
    expect(itensDoCard(card(noPrazo), "2026-10-20", comReg)[0]).toMatchObject({ empresa: "EDIFICIO EXEMPLO", grupo: "GRUPO EXEMPLO" });
  });
});

describe("resolverTier", () => {
  const db = databases();
  const tierNoCard = { new_informar_o_tier_que_pertence_o_cliente_formul_rio_inicial: { value: "Prata" } };

  it("vem da DB - BR NET pela empresa, mesmo com o campo do card preenchido", () => {
    expect(resolverTier(card(tierNoCard), db, "Edifício  Exemplo", "")).toBe("Ouro");
  });

  it("empresa fora da DB - BR NET: usa o campo [NEW] do card", () => {
    expect(resolverTier(card(tierNoCard), db, "OUTRA EMPRESA", "")).toBe("Prata");
  });

  it("empresa sem tier na DB - BR NET: usa o tier do grupo antes do campo do card", () => {
    expect(resolverTier(card(tierNoCard), db, "OUTRA EMPRESA", "Grupo da Base")).toBe("Diamante");
  });

  it("ignora o campo de tier do esquema antigo", () => {
    expect(resolverTier(card({ informar_o_tier_que_pertence_o_cliente: { value: "Tier 1" } }), db, "OUTRA EMPRESA", "")).toBeNull();
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

  it("a DB - BR NET vale mais que o gestor do card", () => {
    expect(resolverGestor(card({}), db, "Empresa da Base", "")).toEqual({ nome: "Patrícia Exemplo", email: "patricia.exemplo@grupobrmed.com.br" });
    expect(resolverGestor(card({}), db, "desconhecida", "Grupo da Base")).toEqual({ nome: "Karen Exemplo", email: null });
  });

  it("o registro da DB - BR NET ligado ao card vem antes da busca pelo nome", () => {
    const comReg = { ...databases(), brnetPorRegistro: new Map([["777", { empresa: "X", grupo: "Y", coordenador: "Flávia Exemplo", tier: "Bronze" }]]) };
    const c = card({ new_informar_a_empresa_br_net: { value: '["x"]', connectedRepoItems: [{ id: "777", title: "x" }] } });
    expect(resolverGestor(c, comReg, "Empresa da Base", "")).toMatchObject({ nome: "Flávia Exemplo" });
    expect(resolverTier(c, comReg, "Edifício Exemplo", "")).toBe("Bronze");
  });

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

  it("sem gestor no card: usa a empresa na DB - BR NET", () => {
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
