// Envio da edição: um e-mail por gestor com e-mail, sem repetir quem já recebeu (tabela envios).
// A carteira de gestor sem e-mail, ou com e-mail recusado, é encaminhada para RESERVA_EMAIL: nenhum cliente fica sem aviso.
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

/**
 * `recusados`: endereço recusado pelo provedor (não adianta reenviar). `falhas`: erro passageiro, que um novo run reenvia.
 * `encaminhados`: gestores (sem e-mail ou recusados) cuja carteira foi para a reserva. `semEmail`: sem e-mail e sem reserva.
 */
export type ResultadoEnvio = {
  enviados: string[];
  pulados: string[];
  encaminhados: string[];
  semEmail: Carteira[];
  recusados: Falha[];
  falhas: Falha[];
};

export type Destinos = { teste?: string; reserva?: string[] };

export async function enviarEdicao(
  carteiras: Carteira[],
  edicao: { id: string; data: Dia; periodo: Periodo },
  modo: Exclude<ModoEnvio, "desligado">,
  remetente: Remetente,
  registro: RegistroEnvios,
  destinos: Destinos = {},
): Promise<ResultadoEnvio> {
  if (modo === "teste" && !destinos.teste) throw new Error("ENVIO=teste exige ALERTA_EMAIL");
  const r: ResultadoEnvio = { enviados: [], pulados: [], encaminhados: [], semEmail: [], recusados: [], falhas: [] };
  const ja = modo === "gestores" ? await registro.jaEnviados(edicao.id) : new Set<string>();
  const reserva = modo === "teste" ? [destinos.teste!] : (destinos.reserva ?? []);

  const enviar = async (c: Carteira, para: string, prefixo = "") => {
    const msg = await montarEmail(c, edicao.data, edicao.periodo, para);
    msg.assunto = `${prefixo}${msg.assunto}`;
    return (await remetente.enviar(msg)).id;
  };

  /** Encaminha a carteira para a reserva; a chave em `envios` evita repetir num novo run. */
  const encaminhar = async (c: Carteira, chave: string, motivo: string) => {
    if (!reserva.length) return false;
    let id = "";
    for (const para of reserva) id = await enviar(c, para, `${modo === "teste" ? "[TESTE] " : ""}[Encaminhado] ${c.nome} (${motivo}): `);
    if (modo === "gestores") await registro.registrar(edicao.id, chave, id);
    r.encaminhados.push(c.nome);
    return true;
  };

  for (const c of carteiras) {
    const email = c.email?.toLowerCase();
    const chaveReserva = `reserva:${email ?? `nome:${c.nome}`}`;
    if ((email && ja.has(email)) || ja.has(chaveReserva)) {
      r.pulados.push(email ?? c.nome);
      continue;
    }
    const falha = (e: unknown): Falha => ({ gestor: email ? `${c.nome} <${email}>` : c.nome, itens: c.itens.length, erro: e instanceof Error ? e.message : String(e) });

    try {
      if (!email) {
        if (!(await encaminhar(c, chaveReserva, "sem e-mail cadastrado"))) r.semEmail.push(c);
        continue;
      }
      try {
        const id = await enviar(c, modo === "teste" ? destinos.teste! : email, modo === "teste" ? `[TESTE] ${c.nome}: ` : "");
        if (modo === "gestores") await registro.registrar(edicao.id, email, id);
        r.enviados.push(email);
      } catch (e) {
        if (!(e instanceof EnderecoRecusado)) throw e;
        r.recusados.push(falha(e));
        await encaminhar(c, chaveReserva, "e-mail recusado");
      }
    } catch (e) {
      r.falhas.push(falha(e));
    }
  }
  return r;
}

/** Texto do aviso para ALERTA_EMAIL quando há gestor sem e-mail ou falha de envio; null se está tudo certo. */
export function resumoProblemas(r: ResultadoEnvio): string | null {
  const linhas: string[] = [];
  const secao = (titulo: string, itens: string[]) => {
    if (!itens.length) return;
    if (linhas.length) linhas.push("");
    linhas.push(titulo, ...itens.map((i) => `- ${i}`));
  };
  secao(
    "Gestores sem e-mail na Equipe Comercial e sem RESERVA_EMAIL (a carteira não foi enviada a ninguém):",
    r.semEmail.map((c) => `${c.nome}: ${c.itens.length} itens`),
  );
  secao(
    "E-mails recusados (conta inexistente ou inativa; corrigir o gestor na DB - BR NET ou o e-mail na Equipe Comercial):",
    r.recusados.map((f) => `${f.gestor}, ${f.itens} itens: ${f.erro}`),
  );
  secao("Carteiras encaminhadas para RESERVA_EMAIL:", r.encaminhados);
  secao("Envios que falharam (rodar o job de novo reenvia só esses):", r.falhas.map((f) => `${f.gestor}: ${f.erro}`));
  return linhas.length ? linhas.join("\n") : null;
}
