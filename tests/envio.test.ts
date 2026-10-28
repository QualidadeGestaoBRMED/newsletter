import { describe, expect, it } from "vitest";
import type { Carteira, ItemEdicao } from "../jobs/edicao";
import type { Item } from "../jobs/regras";
import { destinosAlerta, EnderecoRecusado, type Mensagem, type Remetente } from "../jobs/email";
import { enviarEdicao, modoEnvio, resumoProblemas, type RegistroEnvios } from "../jobs/envio";

process.env.PAINEL_URL ||= "https://painel.exemplo";

const edicao = { id: "2026-10-27-manha", data: "2026-10-27", periodo: "manha" as const };
const carteira = (nome: string, email: string | null): Carteira => ({ nome, email, itens: [] });

function remetente(falhaPara?: string, recusaPara?: string) {
  const enviadas: Mensagem[] = [];
  const r: Remetente = {
    async enviar(m) {
      if (m.para.email === falhaPara) throw new Error("Mandrill fora do ar");
      if (m.para.email === recusaPara) throw new EnderecoRecusado("Mandrill recusou: rejected hard-bounce");
      enviadas.push(m);
      return { id: `id-${enviadas.length}` };
    },
  };
  return { r, enviadas };
}

function registro(ja: string[] = []) {
  const gravados: string[] = [];
  const reg: RegistroEnvios = {
    jaEnviados: async () => new Set(ja),
    registrar: async (_e, d) => void gravados.push(d),
  };
  return { reg, gravados };
}

describe("modoEnvio", () => {
  it("vazio é desligado; valor desconhecido é erro", () => {
    expect(modoEnvio(undefined)).toBe("desligado");
    expect(modoEnvio(" Gestores ")).toBe("gestores");
    expect(() => modoEnvio("todos")).toThrow();
  });
});

const item = (card: string, status: Item["status"], dias_atraso: number, prazo: string) =>
  ({ item_id: card, card_id: card, card, area: "ST", demanda: "PGR", empresa: "Cliente <X>", grupo: "G", gestor_nome: null, gestor_email: null,
    tier: null, campo_prazo: "p", prazo, status, dias_atraso, fase_id: "f", fase_nome: "F", link: `https://app.pipefy.com/open-cards/${card}`,
    situacao_fim_dia: null }) as ItemEdicao;

describe("enviarEdicao", () => {
  const lista = [carteira("Ana", "ana@x.com"), carteira("Bia", "bia@x.com"), carteira("Sem Email", null)];

  it("gestores: cada um recebe a sua, registra o envio e lista quem está sem e-mail", async () => {
    const { r, enviadas } = remetente();
    const { reg, gravados } = registro();
    const res = await enviarEdicao(lista, edicao, "gestores", r, reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["ana@x.com", "bia@x.com"]);
    expect(gravados).toEqual(["ana@x.com", "bia@x.com"]);
    expect(res.semEmail.map((x) => x.carteira.nome)).toEqual(["Sem Email"]);
  });

  it("não reenvia para quem já recebeu nesta edição", async () => {
    const { r, enviadas } = remetente();
    const res = await enviarEdicao(lista, edicao, "gestores", r, registro(["ana@x.com"]).reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["bia@x.com"]);
    expect(res.pulados).toEqual(["ana@x.com"]);
  });

  it("uma falha não impede os outros envios e não é registrada", async () => {
    const { r, enviadas } = remetente("ana@x.com");
    const { reg, gravados } = registro();
    const res = await enviarEdicao(lista, edicao, "gestores", r, reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["bia@x.com"]);
    expect(gravados).toEqual(["bia@x.com"]);
    expect(res.falhas.map((x) => x.motivo)).toEqual(["Mandrill fora do ar"]);
  });

  it("endereço recusado (conta inativa) vai para recusados, não para falhas", async () => {
    const { r, enviadas } = remetente(undefined, "ana@x.com");
    const res = await enviarEdicao(lista, edicao, "gestores", r, registro().reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["bia@x.com"]);
    expect(res.falhas).toEqual([]);
    expect(res.recusados.map((x) => x.carteira.nome)).toEqual(["Ana"]);
  });

  it("endereço recusado recentemente (recusa já expirada no Mandrill) nem é tentado", async () => {
    const { r, enviadas } = remetente();
    r.recusaRecente = async (e) => (e === "ana@x.com" ? "recusado pelo Mandrill em 2026-10-27 (soft-bounce)" : null);
    const res = await enviarEdicao(lista.slice(0, 2), edicao, "gestores", r, registro().reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["bia@x.com"]);
    expect(res.recusados[0].motivo).toContain("soft-bounce");
  });

  it("teste: tudo vai para a caixa de teste, com [TESTE] e o nome do gestor, sem registrar", async () => {
    const { r, enviadas } = remetente();
    const { reg, gravados } = registro(["ana@x.com"]);
    await enviarEdicao(lista, edicao, "teste", r, reg, "eu@x.com");
    expect(enviadas.map((m) => m.para.email)).toEqual(["eu@x.com", "eu@x.com"]);
    expect(enviadas[0].assunto).toMatch(/^\[TESTE\] Ana: Seus prazos/);
    expect(gravados).toEqual([]);
  });
});

describe("resumoProblemas", () => {
  it("sem problemas, não há e-mail", async () => {
    const res = await enviarEdicao([carteira("Ana", "ana@x.com")], edicao, "gestores", remetente().r, registro().reg);
    expect(resumoProblemas(res, edicao, "eu@x.com")).toBeNull();
  });

  it("um único e-mail com o motivo de cada carteira e os itens dela, do mais urgente ao menos", async () => {
    const ana = { nome: "Ana", email: "ana@x.com", itens: [item("111", "No radar (até D+2)", 0, "2026-10-29"), item("222", "Atrasado", 5, "2026-10-22")] };
    const sem = { nome: "Sem Email", email: null, itens: [item("333", "Atrasado", 1, "2026-10-26")] };
    const { r } = remetente(undefined, "ana@x.com");
    const res = await enviarEdicao([ana, sem], edicao, "gestores", r, registro().reg);
    const m = resumoProblemas(res, edicao, "eu@x.com")!;

    expect(m.para.email).toBe("eu@x.com");
    expect(m.assunto).toBe("[Briefing Suporte] 2026-10-27-manha: 2 carteiras não chegaram ao gestor");
    expect(m.texto).toContain("Ana <ana@x.com>: 2 itens (Mandrill recusou: rejected hard-bounce)");
    expect(m.texto).toContain("Sem Email: 1 itens (sem e-mail cadastrado na Equipe Comercial)");
    expect(m.html.indexOf("open-cards/222")).toBeLessThan(m.html.indexOf("open-cards/111"));
    expect(m.html).toContain("Atrasado 5d");
    expect(m.html).toContain("Cliente &lt;X&gt;");
    expect(m.html).toContain("gestor=Ana");
  });
});

describe("destinosAlerta", () => {
  it("aceita vários endereços separados por vírgula ou ponto e vírgula", () => {
    expect(destinosAlerta("projetos@x.com, eu@x.com;outro@x.com ")).toEqual(["projetos@x.com", "eu@x.com", "outro@x.com"]);
    expect(destinosAlerta("")).toEqual([]);
  });
});
