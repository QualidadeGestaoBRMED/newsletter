import { describe, expect, it } from "vitest";
import { contaPermitida, listaGestao } from "../lib/acesso";

describe("contaPermitida", () => {
  it("aceita conta verificada do domínio, sem diferenciar maiúsculas", () => {
    expect(contaPermitida({ email: "ana.ribeiro@grupobrmed.com.br", email_verified: true })).toBe(true);
    expect(contaPermitida({ email: "Ana.Ribeiro@GrupoBRMED.com.br", email_verified: true })).toBe(true);
  });
  it("recusa e-mail não verificado ou ausente", () => {
    expect(contaPermitida({ email: "ana@grupobrmed.com.br", email_verified: false })).toBe(false);
    expect(contaPermitida({ email: "ana@grupobrmed.com.br" })).toBe(false);
    expect(contaPermitida({ email_verified: true })).toBe(false);
    expect(contaPermitida(null)).toBe(false);
  });
  it("recusa outros domínios, inclusive os parecidos", () => {
    for (const email of ["ana@gmail.com", "ana@grupobrmed.com.br.evil.com", "ana@evil-grupobrmed.com.br", "ana@sub.grupobrmed.com.br", "grupobrmed.com.br@gmail.com"])
      expect(contaPermitida({ email, email_verified: true })).toBe(false);
  });
});

describe("listaGestao", () => {
  it("separa por vírgula, ignora espaços, vazios e maiúsculas", () => {
    expect([...listaGestao(" Ana@grupobrmed.com.br, ,bruno@grupobrmed.com.br ")]).toEqual(["ana@grupobrmed.com.br", "bruno@grupobrmed.com.br"]);
    expect(listaGestao("").size).toBe(0);
  });
});
