// Template do e-mail por gestor. HTML de tabela, sem JS; cores e textos seguem o painel.
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { Periodo } from "../jobs/config";
import type { ItemEdicao, Numeros } from "../jobs/edicao";

const C = {
  navy: "#193B4F",
  teal: "#007891",
  aqua: "#00AFAA",
  ambar: "#CC851E",
  ferrugem: "#A05E1E",
  cinza1: "#767A7B",
  cinza3: "#DFE0E2",
  cinza4: "#F3F3F3",
  tinta: "#4A555C",
};
const WS = "'Work Sans', Arial, sans-serif";
const RB = "Roboto, Arial, sans-serif";

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const pl = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export type NewsletterProps = {
  nome: string;
  periodo: Periodo;
  data: string; // AAAA-MM-DD
  horario: string;
  numeros: Numeros;
  fila: ItemEdicao[]; // até 3, já ordenados
  linkPainel: string;
};

export function dataPorExtenso(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  return `${DIA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MES[d.getUTCMonth()]}`;
}

function Bolha({ valor, rotulo, cor, clara }: { valor: number; rotulo: string; cor: string; clara?: boolean }) {
  return (
    <Column align="center" style={{ width: "33%", padding: "0 4px", verticalAlign: "top" }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
        <tbody>
          <tr>
            <td
              align="center"
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: clara ? "#FFFFFF" : cor,
                border: clara ? `2px solid ${C.cinza3}` : `2px solid ${cor}`,
                color: clara ? C.navy : "#FFFFFF",
                fontFamily: WS,
                fontSize: 30,
                lineHeight: "72px",
              }}
            >
              {valor < 10 ? `0${valor}` : valor}
            </td>
          </tr>
        </tbody>
      </table>
      <Text style={{ margin: "8px 0 0", fontFamily: RB, fontSize: 13, lineHeight: "18px", color: C.tinta }}>{rotulo}</Text>
    </Column>
  );
}

export default function NewsletterGestor({ nome, periodo, data, horario, numeros: n, fila, linkPainel }: NewsletterProps) {
  const tarde = periodo === "tarde";
  const primeiro = nome.split(" ")[0] || "time";
  const saudacao = tarde ? `Boa noite, ${primeiro}.` : `Bom dia, ${primeiro}.`;
  const acao = n.vencidas + n.hoje;
  const total = n.vencidas + n.hoje + n.radar;

  const destaque = tarde
    ? `${n.concluidas} de ${total} ${pl(total, "demanda resolvida", "demandas resolvidas")} no dia.`
    : `${acao} ${pl(acao, "demanda pede", "demandas pedem")} ação hoje.`;

  const bolhas = tarde
    ? [
        { valor: n.atrasadasAbertas, rotulo: pl(n.atrasadasAbertas, "atrasada em aberto", "atrasadas em aberto"), cor: C.ferrugem },
        { valor: n.viramAtraso, rotulo: pl(n.viramAtraso, "vira atraso amanhã", "viram atraso amanhã"), cor: C.ambar },
        { valor: n.concluidas, rotulo: pl(n.concluidas, "resolvida no dia", "resolvidas no dia"), cor: C.aqua, clara: true },
      ]
    : [
        { valor: n.vencidas, rotulo: "com prazo vencido", cor: C.ferrugem },
        { valor: n.hoje, rotulo: pl(n.hoje, "vence hoje", "vencem hoje"), cor: C.ambar },
        { valor: n.radar, rotulo: "nos próximos 2 dias", cor: C.aqua, clara: true },
      ];

  return (
    <Html lang="pt-BR">
      <Head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&family=Roboto:wght@300;400;500&display=swap"
        />
      </Head>
      <Preview>{`${saudacao} ${destaque}`}</Preview>
      <Body style={{ margin: 0, background: "#E9EDEF", fontFamily: RB }}>
        <Container style={{ width: "100%", maxWidth: 600, margin: "0 auto", background: "#FFFFFF" }}>
          {/* capa */}
          <Section style={{ background: C.teal, padding: "20px 32px" }}>
            <Text style={{ margin: 0, fontFamily: WS, fontSize: 12, letterSpacing: "0.06em", color: "#FFFFFF" }}>
              <b>NEWSLETTER SUPORTE</b>&nbsp;·&nbsp;PRAZOS DO CLIENTE
            </Text>
          </Section>
          <Section style={{ background: C.navy, padding: "28px 32px 32px" }}>
            <Text style={{ margin: 0, fontFamily: WS, fontSize: 15, fontWeight: 500, color: C.aqua }}>Edição da</Text>
            <Text style={{ margin: 0, fontFamily: WS, fontSize: 56, lineHeight: "56px", fontWeight: 700, letterSpacing: "-0.04em", color: "#FFFFFF" }}>
              {tarde ? "tarde" : "manhã"}
            </Text>
            <Text style={{ margin: "10px 0 0", fontFamily: WS, fontSize: 14, color: "rgba(255,255,255,0.62)" }}>
              {horario} · {dataPorExtenso(data)}
            </Text>
            <Text style={{ margin: "24px 0 0", fontFamily: WS, fontSize: 24, fontWeight: 300, lineHeight: "28px", color: "#FFFFFF" }}>
              {saudacao}
            </Text>
            <Text style={{ margin: "4px 0 0", fontFamily: WS, fontSize: 20, fontWeight: 600, lineHeight: "26px", color: "#FFFFFF" }}>
              {destaque}
            </Text>
          </Section>

          {/* números */}
          <Section style={{ padding: "28px 24px 8px" }}>
            <Row>
              {bolhas.map((b) => (
                <Bolha key={b.rotulo} {...b} />
              ))}
            </Row>
          </Section>

          {/* fila */}
          <Section style={{ padding: "16px 32px 0" }}>
            <Text style={{ margin: "0 0 4px", fontFamily: WS, fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: C.teal }}>
              {tarde ? "Amanhã, comece por" : "Comece por aqui"}
            </Text>
            {fila.length === 0 ? (
              <Text style={{ fontSize: 14, color: C.cinza1 }}>Nada pendente na sua carteira.</Text>
            ) : (
              fila.map((it) => (
                <Section key={it.item_id} style={{ borderBottom: `1px solid ${C.cinza3}`, padding: "12px 0" }}>
                  <Row>
                    <Column style={{ verticalAlign: "top" }}>
                      <Link href={it.link} style={{ fontFamily: WS, fontSize: 15, fontWeight: 500, color: C.navy, textDecoration: "none" }}>
                        {it.demanda}
                      </Link>
                      <Text style={{ margin: "2px 0 0", fontSize: 13, lineHeight: "18px", color: C.tinta }}>{it.empresa}</Text>
                      <Text style={{ margin: "2px 0 0", fontSize: 12, lineHeight: "16px", color: C.cinza1 }}>
                        {it.area} · <Link href={it.link} style={{ color: C.teal }}>abrir card {it.card_id}</Link>
                      </Text>
                    </Column>
                    <Column align="right" style={{ width: 110, verticalAlign: "top", fontFamily: WS }}>
                      {it.dias_atraso ? (
                        <>
                          <Text style={{ margin: 0, fontSize: 20, lineHeight: "22px", color: C.ferrugem }}>{it.dias_atraso}</Text>
                          <Text style={{ margin: 0, fontSize: 11, color: C.cinza1 }}>{pl(it.dias_atraso, "dia de atraso", "dias de atraso")}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={{ margin: 0, fontSize: 20, lineHeight: "22px", color: C.navy }}>{ddmm(it.prazo)}</Text>
                          <Text style={{ margin: 0, fontSize: 11, color: C.cinza1 }}>
                            {it.status === "Próximo do vencimento" ? "prazo no dia" : "prazo"}
                          </Text>
                        </>
                      )}
                    </Column>
                  </Row>
                </Section>
              ))
            )}
          </Section>

          <Section style={{ padding: "28px 32px 32px" }} align="center">
            <Button
              href={linkPainel}
              style={{ background: C.teal, color: "#FFFFFF", borderRadius: 99, padding: "12px 26px", fontFamily: WS, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
            >
              Abrir painel
            </Button>
          </Section>

          <Section style={{ background: C.cinza4, padding: "16px 32px" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: C.cinza1 }}>
              Relatório gerado automaticamente a partir do pipe de Solicitação de Serviços. BR MED · Suporte
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
