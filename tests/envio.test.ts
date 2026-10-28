import { describe, expect, it } from "vitest";
import type { Carteira } from "../jobs/edicao";
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

describe("enviarEdicao", () => {
  const lista = [carteira("Ana", "ana@x.com"), carteira("Bia", "bia@x.com"), carteira("Sem Email", null)];

  it("gestores: cada um recebe a sua, registra o envio e lista quem está sem e-mail", async () => {
    const { r, enviadas } = remetente();
    const { reg, gravados } = registro();
    const res = await enviarEdicao(lista, edicao, "gestores", r, reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["ana@x.com", "bia@x.com"]);
    expect(gravados).toEqual(["ana@x.com", "bia@x.com"]);
    expect(res.semEmail.map((c) => c.nome)).toEqual(["Sem Email"]);
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
    expect(res.falhas).toHaveLength(1);
    expect(resumoProblemas(res)).toContain("Ana <ana@x.com>: Mandrill fora do ar");
  });

  it("endereço recusado (conta inativa) vai para recusados, não para falhas", async () => {
    const { r, enviadas } = remetente(undefined, "ana@x.com");
    const res = await enviarEdicao(lista, edicao, "gestores", r, registro().reg);
    expect(enviadas.map((m) => m.para.email)).toEqual(["bia@x.com"]);
    expect(res.falhas).toEqual([]);
    expect(res.recusados.map((f) => f.gestor)).toEqual(["Ana <ana@x.com>"]);
    expect(resumoProblemas(res)).toContain("conta inexistente ou inativa");
  });

  it("com reserva: carteira recusada ou sem e-mail é encaminhada, com o gestor no assunto", async () => {
    const { r, enviadas } = remetente(undefined, "ana@x.com");
    const { reg, gravados } = registro();
    const res = await enviarEdicao(lista, edicao, "gestores", r, reg, { reserva: ["eu@x.com"] });
    expect(enviadas.map((m) => m.para.email)).toEqual(["eu@x.com", "bia@x.com", "eu@x.com"]);
    expect(enviadas[0].assunto).toMatch(/^\[Encaminhado\] Ana \(e-mail recusado\): Seus prazos/);
    expect(enviadas[2].assunto).toMatch(/^\[Encaminhado\] Sem Email \(sem e-mail cadastrado\): /);
    expect(gravados).toEqual(["reserva:ana@x.com", "bia@x.com", "reserva:nome:Sem Email"]);
    expect(res.encaminhados).toEqual(["Ana", "Sem Email"]);
    expect(res.semEmail).toEqual([]);
  });

  it("não encaminha de novo o que já foi encaminhado nesta edição", async () => {
    const { r, enviadas } = remetente(undefined, "ana@x.com");
    const ja = ["reserva:ana@x.com", "bia@x.com", "reserva:nome:Sem Email"];
    await enviarEdicao(lista, edicao, "gestores", r, registro(ja).reg, { reserva: ["eu@x.com"] });
    expect(enviadas).toEqual([]);
  });

  it("teste: tudo vai para a caixa de teste, com [TESTE] e o nome do gestor, sem registrar", async () => {
    const { r, enviadas } = remetente();
    const { reg, gravados } = registro(["ana@x.com"]);
    await enviarEdicao(lista, edicao, "teste", r, reg, { teste: "eu@x.com", reserva: ["outro@x.com"] });
    // a carteira sem e-mail também vai para a caixa de teste, nunca para a reserva
    expect(enviadas.map((m) => m.para.email)).toEqual(["eu@x.com", "eu@x.com", "eu@x.com"]);
    expect(enviadas[0].assunto).toMatch(/^\[TESTE\] Ana: Seus prazos/);
    expect(enviadas[2].assunto).toMatch(/^\[TESTE\] \[Encaminhado\] Sem Email/);
    expect(gravados).toEqual([]);
  });

  it("sem problemas, não há aviso", async () => {
    const res = await enviarEdicao([carteira("Ana", "ana@x.com")], edicao, "gestores", remetente().r, registro().reg);
    expect(resumoProblemas(res)).toBeNull();
  });
});

describe("destinosAlerta", () => {
  it("aceita vários endereços separados por vírgula ou ponto e vírgula", () => {
    expect(destinosAlerta("projetos@x.com, eu@x.com;outro@x.com ")).toEqual(["projetos@x.com", "eu@x.com", "outro@x.com"]);
    expect(destinosAlerta("")).toEqual([]);
  });
});
