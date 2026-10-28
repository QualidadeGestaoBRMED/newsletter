// Monta o e-mail de cada gestor e envia. O envio fica atrás de `Remetente` para trocar Mandrill por Gmail/SMTP.
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import NewsletterGestor from "../emails/NewsletterGestor";
import { HORARIO, type Periodo } from "./config";
import { numeros, type Carteira } from "./edicao";
import { exigir } from "./env";
import type { Dia } from "./regras";

/** Imagem embutida na mensagem, referenciada no HTML como `cid:${nome}`. */
export type Imagem = { nome: string; tipo: string; base64: string };

export type Mensagem = {
  para: { email: string; nome?: string };
  assunto: string;
  html: string;
  texto: string;
  tags?: string[];
  imagens?: Imagem[];
};

const LOGO: Imagem = {
  nome: "logo-brmed",
  tipo: "image/png",
  base64: readFileSync(new URL("../public/logo-brmed.png", import.meta.url)).toString("base64"),
};

/** HTML para abrir no navegador: troca as imagens `cid:` pelo conteúdo embutido. */
export const htmlDePrevia = (m: Mensagem) =>
  (m.imagens ?? []).reduce((h, i) => h.replaceAll(`cid:${i.nome}`, `data:${i.tipo};base64,${i.base64}`), m.html);

/** O provedor recusou o endereço (conta inexistente, inativa ou na lista de rejeição): tentar de novo não adianta. */
export class EnderecoRecusado extends Error {}

export interface Remetente {
  enviar(m: Mensagem): Promise<{ id: string }>;
}

/** ALERTA_EMAIL aceita vários endereços, separados por vírgula ou ponto e vírgula. */
export const destinosAlerta = (v = process.env.ALERTA_EMAIL ?? "") => v.split(/[,;]/).map((e) => e.trim()).filter(Boolean);

/** RESERVA_EMAIL recebe a carteira de gestor sem e-mail ou com e-mail recusado; vazio, vale o ALERTA_EMAIL. */
export const destinosReserva = () => destinosAlerta(process.env.RESERVA_EMAIL?.trim() || process.env.ALERTA_EMAIL);

export function linkPainel(data: Dia, periodo: Periodo, gestor?: string) {
  const u = new URL(exigir("PAINEL_URL"));
  u.searchParams.set("ed", `${data}-${periodo}`);
  if (gestor) u.searchParams.set("gestor", gestor);
  return u.toString();
}

export async function montarEmail(c: Carteira, data: Dia, periodo: Periodo, para = c.email): Promise<Mensagem> {
  if (!para) throw new Error(`Gestor ${c.nome} sem e-mail`);
  const n = numeros(c.itens);
  const tarde = periodo === "tarde";

  const props = { nome: c.nome, periodo, data, horario: HORARIO[periodo], numeros: n, linkPainel: linkPainel(data, periodo, c.nome), logo: `cid:${LOGO.nome}` };
  // sem data: o e-mail chega no próprio dia e horário da edição
  const assunto = tarde
    ? `Prazos: ${n.concluidas} resolvidas, ${n.viramAtraso} viram atraso amanhã · tarde`
    : `Seus prazos: ${n.vencidas} ${n.vencidas === 1 ? "vencida" : "vencidas"}, ${n.hoje} ${n.hoje === 1 ? "vence" : "vencem"} hoje`;

  return {
    para: { email: para, nome: c.nome },
    assunto,
    html: await render(NewsletterGestor(props)),
    texto: await render(NewsletterGestor(props), { plainText: true }),
    tags: ["newsletter-suporte", periodo],
    imagens: [LOGO],
  };
}

// ---------- remetentes ----------

const MANDRILL_URL = "https://mandrillapp.com/api/1.0/messages/send";

export class MandrillRemetente implements Remetente {
  private chave = exigir("MANDRILL_API_KEY");
  private de = exigir("REMETENTE_EMAIL");
  private nome = process.env.REMETENTE_NOME?.trim() || "Briefing Suporte";

  async enviar(m: Mensagem) {
    const res = await fetch(MANDRILL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: this.chave,
        message: {
          from_email: this.de,
          from_name: this.nome,
          to: [{ email: m.para.email, name: m.para.nome, type: "to" }],
          subject: m.assunto,
          html: m.html,
          text: m.texto,
          tags: m.tags,
          images: m.imagens?.map((i) => ({ type: i.tipo, name: i.nome, content: i.base64 })),
          track_opens: false,
          track_clicks: false, // links do Pipefy e do painel ficam intactos
          auto_text: false,
        },
      }),
    });
    const body = (await res.json()) as { status?: string; _id?: string; reject_reason?: string; message?: string }[] | { message: string };
    if (!res.ok || !Array.isArray(body)) throw new Error(`Mandrill HTTP ${res.status}: ${JSON.stringify(body)}`);
    const r = body[0];
    if (r && ["rejected", "invalid"].includes(r.status ?? "")) throw new EnderecoRecusado(`Mandrill recusou ${m.para.email}: ${r.status} ${r.reject_reason ?? ""}`);
    if (!r || !["sent", "queued", "scheduled"].includes(r.status ?? "")) throw new Error(`Mandrill: ${m.para.email} ${r?.status} ${r?.reject_reason ?? ""}`);
    return { id: r._id! };
  }
}

/** Para --dry-run: só imprime. */
export class ConsoleRemetente implements Remetente {
  async enviar(m: Mensagem) {
    console.log(`\n--- e-mail para ${m.para.nome} <${m.para.email}>\nAssunto: ${m.assunto}\n${m.texto.slice(0, 1200)}`);
    return { id: "dry-run" };
  }
}
