import { describe, expect, it } from "vitest";
import { cronAutorizado } from "../lib/cron";

describe("cronAutorizado", () => {
  it("aceita só o segredo exato, no formato Bearer", () => {
    expect(cronAutorizado("Bearer abc123", "abc123")).toBe(true);
    expect(cronAutorizado("Bearer abc124", "abc123")).toBe(false);
    expect(cronAutorizado("abc123", "abc123")).toBe(false);
    expect(cronAutorizado("Bearer abc1234", "abc123")).toBe(false);
  });
  it("recusa tudo sem segredo configurado ou sem cabeçalho", () => {
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
    expect(cronAutorizado(null, "abc123")).toBe(false);
  });
});
