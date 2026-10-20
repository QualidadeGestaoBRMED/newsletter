// Monta o e-mail de cada gestor e envia. O envio fica atrás de `Remetente` para trocar Mandrill por Gmail/SMTP.
import { render } from "@react-email/render";
import NewsletterGestor, { dataPorExtenso } from "../emails/NewsletterGestor";
import { HORARIO, type Periodo } from "./config";
import { numeros, porUrgencia, type Carteira } from "./edicao";
import { exigir } from "./env";
import type { Dia } from "./regras";

export type Mensagem = {
  para: { email: string; nome?: string };
  assunto: string;
  html: string;
  texto: string;
  tags?: string[];
};

export interface Remetente {
  enviar(m: Mensagem): Promise<{ id: string }>;
}

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
  const aberto = c.itens.filter((i) => i.situacao_fim_dia !== "Concluído hoje");
  const fila = (tarde ? aberto.filter((i) => i.status !== "No radar (até D+2)") : c.itens).slice().sort(porUrgencia).slice(0, 3);

  const props = { nome: c.nome, periodo, data, horario: HORARIO[periodo], numeros: n, fila, linkPainel: linkPainel(data, periodo, c.nome) };
  const quando = `${tarde ? "Edição da tarde" : "Edição da manhã"} · ${dataPorExtenso(data)}`;
  const assunto = tarde
    ? `Prazos: ${n.concluidas} resolvidas, ${n.viramAtraso} viram atraso amanhã · ${quando}`
    : `Prazos: ${n.vencidas} vencidas, ${n.hoje} vencem hoje · ${quando}`;

  return {
    para: { email: para, nome: c.nome },
    assunto,
    html: await render(NewsletterGestor(props)),
    texto: await render(NewsletterGestor(props), { plainText: true }),
    tags: ["newsletter-suporte", periodo],
  };
}

// ---------- remetentes ----------

const MANDRILL_URL = "https://mandrillapp.com/api/1.0/messages/send";

export class MandrillRemetente implements Remetente {
  private chave = exigir("MANDRILL_API_KEY");
  private de = exigir("REMETENTE_EMAIL");
  private nome = process.env.REMETENTE_NOME?.trim() || "BR MED · Suporte";

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
          track_opens: false,
          track_clicks: false, // links do Pipefy e do painel ficam intactos
          auto_text: false,
        },
      }),
    });
    const body = (await res.json()) as { status?: string; _id?: string; reject_reason?: string; message?: string }[] | { message: string };
    if (!res.ok || !Array.isArray(body)) throw new Error(`Mandrill HTTP ${res.status}: ${JSON.stringify(body)}`);
    const r = body[0];
    if (!r || !["sent", "queued", "scheduled"].includes(r.status ?? "")) {
      throw new Error(`Mandrill recusou ${m.para.email}: ${r?.status} ${r?.reject_reason ?? ""}`);
    }
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
