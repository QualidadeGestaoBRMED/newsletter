// Envio da edição: um e-mail por gestor com e-mail, sem repetir quem já recebeu (tabela envios).
import type { Periodo } from "./config";
import type { Carteira } from "./edicao";
import { EnderecoRecusado, montarEmail, type Remetente } from "./email";
import type { Dia } from "./regras";

/**
 * ENVIO (variável do Actions):
 * - desligado: só gera a edição (padrão);
 * - teste: todos os e-mails vão para ALERTA_EMAIL, com [TESTE] no assunto, sem registrar envio;
 * - gestores: cada gestor recebe a própria carteira.
 */
export type ModoEnvio = "desligado" | "teste" | "gestores";

export function modoEnvio(v = process.env.ENVIO): ModoEnvio {
  const m = v?.trim().toLowerCase() || "desligado";
  if (m !== "desligado" && m !== "teste" && m !== "gestores") throw new Error(`ENVIO inválido: ${v} (use desligado, teste ou gestores)`);
  return m;
}

/** O que o envio precisa do banco (implementado em banco.ts; nos testes, em memória). */
export interface RegistroEnvios {
  jaEnviados(edicao: string): Promise<Set<string>>;
  registrar(edicao: string, destinatario: string, messageId: string): Promise<void>;
}

type Falha = { gestor: string; itens: number; erro: string };

/** `recusados`: endereço recusado pelo provedor (não adianta reenviar). `falhas`: erro passageiro, que um novo run reenvia. */
export type ResultadoEnvio = { enviados: string[]; pulados: string[]; semEmail: Carteira[]; recusados: Falha[]; falhas: Falha[] };

export async function enviarEdicao(
  carteiras: Carteira[],
  edicao: { id: string; data: Dia; periodo: Periodo },
  modo: Exclude<ModoEnvio, "desligado">,
  remetente: Remetente,
  registro: RegistroEnvios,
  paraTeste?: string,
): Promise<ResultadoEnvio> {
  if (modo === "teste" && !paraTeste) throw new Error("ENVIO=teste exige ALERTA_EMAIL");
  const r: ResultadoEnvio = { enviados: [], pulados: [], semEmail: carteiras.filter((c) => !c.email), recusados: [], falhas: [] };
  const ja = modo === "gestores" ? await registro.jaEnviados(edicao.id) : new Set<string>();

  for (const c of carteiras) {
    if (!c.email) continue;
    const email = c.email.toLowerCase();
    if (ja.has(email)) {
      r.pulados.push(email);
      continue;
    }
    try {
      const msg = await montarEmail(c, edicao.data, edicao.periodo, modo === "teste" ? paraTeste : email);
      if (modo === "teste") msg.assunto = `[TESTE] ${c.nome}: ${msg.assunto}`;
      const { id } = await remetente.enviar(msg);
      if (modo === "gestores") await registro.registrar(edicao.id, email, id);
      r.enviados.push(email);
    } catch (e) {
      const f = { gestor: `${c.nome} <${email}>`, itens: c.itens.length, erro: e instanceof Error ? e.message : String(e) };
      (e instanceof EnderecoRecusado ? r.recusados : r.falhas).push(f);
    }
  }
  return r;
}

/** Texto do aviso para ALERTA_EMAIL quando há gestor sem e-mail ou falha de envio; null se está tudo certo. */
export function resumoProblemas(r: ResultadoEnvio): string | null {
  const linhas: string[] = [];
  if (r.semEmail.length) {
    linhas.push("Gestores sem e-mail na Equipe Comercial (não receberam):");
    for (const c of r.semEmail) linhas.push(`- ${c.nome}: ${c.itens.length} itens`);
  }
  if (r.recusados.length) {
    if (linhas.length) linhas.push("");
    linhas.push("E-mails recusados (conta inexistente ou inativa; corrigir o gestor na DB - BR NET ou o e-mail na Equipe Comercial):");
    for (const f of r.recusados) linhas.push(`- ${f.gestor}, ${f.itens} itens: ${f.erro}`);
  }
  if (r.falhas.length) {
    if (linhas.length) linhas.push("");
    linhas.push("Envios que falharam (rodar o job de novo reenvia só esses):");
    for (const f of r.falhas) linhas.push(`- ${f.gestor}: ${f.erro}`);
  }
  return linhas.length ? linhas.join("\n") : null;
}
