// Envio da edição: um e-mail por gestor com e-mail, sem repetir quem já recebeu (tabela envios).
// O que não chega a nenhum gestor (sem e-mail, e-mail recusado, falha) vai num único resumo para o ALERTA_EMAIL.
import { AREA_NOME, type Periodo } from "./config";
import { porUrgencia, type Carteira } from "./edicao";
import { EnderecoRecusado, linkPainel, montarEmail, type Mensagem, type Remetente } from "./email";
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

/** Carteira que não chegou ao gestor, e por quê. */
export type NaoEntregue = { carteira: Carteira; motivo: string };

/**
 * `recusados`: e-mail recusado pelo provedor (conta inexistente ou inativa; não adianta reenviar).
 * `falhas`: erro passageiro, que um novo run reenvia.
 */
export type ResultadoEnvio = { enviados: string[]; pulados: string[]; semEmail: NaoEntregue[]; recusados: NaoEntregue[]; falhas: NaoEntregue[] };

export async function enviarEdicao(
  carteiras: Carteira[],
  edicao: { id: string; data: Dia; periodo: Periodo },
  modo: Exclude<ModoEnvio, "desligado">,
  remetente: Remetente,
  registro: RegistroEnvios,
  paraTeste?: string,
): Promise<ResultadoEnvio> {
  if (modo === "teste" && !paraTeste) throw new Error("ENVIO=teste exige ALERTA_EMAIL");
  const r: ResultadoEnvio = { enviados: [], pulados: [], semEmail: [], recusados: [], falhas: [] };
  const ja = modo === "gestores" ? await registro.jaEnviados(edicao.id) : new Set<string>();
  const erro = (e: unknown) => (e instanceof Error ? e.message : String(e));

  for (const c of carteiras) {
    if (!c.email) {
      r.semEmail.push({ carteira: c, motivo: "sem e-mail cadastrado na Equipe Comercial" });
      continue;
    }
    const email = c.email.toLowerCase();
    if (ja.has(email)) {
      r.pulados.push(email);
      continue;
    }
    try {
      // a recusa por conta inativa expira no Mandrill em 1 dia: sem esta consulta o e-mail sairia e voltaria dia sim, dia não
      const recusa = await remetente.recusaRecente?.(email);
      if (recusa) throw new EnderecoRecusado(recusa);
      const msg = await montarEmail(c, edicao.data, edicao.periodo, modo === "teste" ? paraTeste : email);
      if (modo === "teste") msg.assunto = `[TESTE] ${c.nome}: ${msg.assunto}`;
      const { id } = await remetente.enviar(msg);
      if (modo === "gestores") await registro.registrar(edicao.id, email, id);
      r.enviados.push(email);
    } catch (e) {
      (e instanceof EnderecoRecusado ? r.recusados : r.falhas).push({ carteira: c, motivo: erro(e) });
    }
  }
  return r;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SECOES: { chave: "semEmail" | "recusados" | "falhas"; titulo: string; acao: string }[] = [
  { chave: "recusados", titulo: "E-mail recusado (conta inexistente ou inativa)", acao: "passar os clientes para um gestor ativo na DB - BR NET, ou corrigir o e-mail na Equipe Comercial" },
  { chave: "semEmail", titulo: "Gestor sem e-mail", acao: "cadastrar o gestor na Equipe Comercial com o mesmo nome da DB - BR NET" },
  { chave: "falhas", titulo: "Falha no envio", acao: "rodar o workflow de novo: ele reenvia só esses" },
];

/**
 * Um único e-mail com tudo o que não chegou aos gestores: o motivo de cada carteira e os itens dela, para ninguém
 * ficar sem aviso. null se tudo foi entregue.
 */
export function resumoProblemas(r: ResultadoEnvio, edicao: { id: string; data: Dia; periodo: Periodo }, para: string): Mensagem | null {
  const total = r.semEmail.length + r.recusados.length + r.falhas.length;
  if (!total) return null;
  const itens = [...r.semEmail, ...r.recusados, ...r.falhas].reduce((n, x) => n + x.carteira.itens.length, 0);

  const texto: string[] = [`${total} carteiras (${itens} itens) da edição ${edicao.id} não chegaram ao gestor.`];
  const html: string[] = [
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">`,
    `<p><b>${total} carteiras (${itens} itens)</b> da edição ${edicao.id} não chegaram ao gestor. Os itens estão abaixo.</p>`,
  ];
  for (const s of SECOES) {
    const lista = r[s.chave];
    if (!lista.length) continue;
    html.push(`<h3 style="margin:20px 0 4px">${s.titulo}</h3><p style="margin:0 0 8px;color:#555">O que fazer: ${s.acao}.</p><ul>`);
    texto.push("", `${s.titulo}. O que fazer: ${s.acao}.`);
    for (const { carteira: c, motivo } of lista) {
      const quem = c.email ? `${c.nome} &lt;${esc(c.email)}&gt;` : esc(c.nome);
      html.push(`<li>${quem}: ${c.itens.length} itens <span style="color:#777">(${esc(motivo)})</span></li>`);
      texto.push(`- ${c.nome}${c.email ? ` <${c.email}>` : ""}: ${c.itens.length} itens (${motivo})`);
    }
    html.push(`</ul>`);
  }

  // os itens de cada carteira, para alguém avisar os clientes enquanto o cadastro não é corrigido
  const th = `style="text-align:left;padding:4px 8px;border-bottom:1px solid #ccc"`;
  const td = `style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top"`;
  for (const { carteira: c } of [...r.recusados, ...r.semEmail, ...r.falhas]) {
    html.push(
      `<h3 style="margin:24px 0 4px">${esc(c.nome)}: ${c.itens.length} itens</h3>`,
      `<p style="margin:0 0 6px"><a href="${esc(linkPainel(edicao.data, edicao.periodo, c.nome))}">Abrir a carteira no painel</a></p>`,
      `<table style="border-collapse:collapse;font-size:13px"><tr><th ${th}>Status</th><th ${th}>Prazo</th><th ${th}>Empresa</th><th ${th}>Demanda</th><th ${th}>Área</th><th ${th}>Card</th></tr>`,
    );
    for (const i of [...c.itens].sort(porUrgencia)) {
      const status = i.status === "Atrasado" ? `Atrasado ${i.dias_atraso}d` : i.status;
      html.push(
        `<tr><td ${td}>${esc(status)}</td><td ${td}>${i.prazo.split("-").reverse().join("/")}</td><td ${td}>${esc(i.empresa)}</td>` +
          `<td ${td}>${esc(i.demanda)}</td><td ${td}>${AREA_NOME[i.area]}</td><td ${td}><a href="${esc(i.link)}">${esc(i.card)}</a></td></tr>`,
      );
    }
    html.push(`</table>`);
  }
  html.push(`</div>`);

  return {
    para: { email: para },
    assunto: `[Briefing Suporte] ${edicao.id}: ${total} carteiras não chegaram ao gestor`,
    html: html.join("\n"),
    texto: texto.join("\n"),
    tags: ["newsletter-suporte", "alerta"],
  };
}
