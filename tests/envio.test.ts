import { describe, expect, it } from "vitest";
import type { Carteira } from "../jobs/edicao";
import type { Mensagem, Remetente } from "../jobs/email";
import { enviarEdicao, modoEnvio, resumoProblemas, type RegistroEnvios } from "../jobs/envio";

process.env.PAINEL_URL ||= "https://painel.exemplo";

const edicao = { id: "2026-10-27-manha", data: "2026-10-27", periodo: "manha" as const };
const carteira = (nome: string, email: string | null): Carteira => ({ nome, email, itens: [] });

function remetente(falhaPara?: string) {
  const enviadas: Mensagem[] = [];
  const r: Remetente = {
    async enviar(m) {
      if (m.para.email === falhaPara) throw new Error("Mandrill recusou");
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
    expect(resumoProblemas(res)).toContain("Ana <ana@x.com>: Mandrill recusou");
  });

  it("teste: tudo vai para a caixa de teste, com [TESTE] e o nome do gestor, sem registrar", async () => {
    const { r, enviadas } = remetente();
    const { reg, gravados } = registro(["ana@x.com"]);
    await enviarEdicao(lista, edicao, "teste", r, reg, "eu@x.com");
    expect(enviadas.map((m) => m.para.email)).toEqual(["eu@x.com", "eu@x.com"]);
    expect(enviadas[0].assunto).toMatch(/^\[TESTE\] Ana: Seus prazos/);
    expect(gravados).toEqual([]);
  });

  it("sem problemas, não há aviso", async () => {
    const res = await enviarEdicao([carteira("Ana", "ana@x.com")], edicao, "gestores", remetente().r, registro().reg);
    expect(resumoProblemas(res)).toBeNull();
  });
});
