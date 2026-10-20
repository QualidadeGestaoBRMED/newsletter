// Template do e-mail por gestor. HTML de tabela, sem JS. Curto de propósito: o detalhe fica no painel,
// o e-mail só dá os números do dia e leva até lá.
import { Body, Button, Column, Container, Head, Html, Img, Preview, Row, Section, Text } from "@react-email/components";
import type { Periodo } from "../jobs/config";
import type { Numeros } from "../jobs/edicao";

const C = {
  navy: "#193B4F",
  teal: "#007891",
  aqua: "#00AFAA",
  ambar: "#CC851E",
  ferrugem: "#A05E1E",
  cinza1: "#767A7B",
  cinza2: "#BFC3C6",
  cinza3: "#DFE0E2",
  fundo: "#E9EDEF",
};
const WS = "'Work Sans', Arial, sans-serif";
const RB = "Roboto, Arial, sans-serif";

const pl = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export type NewsletterProps = {
  nome: string;
  periodo: Periodo;
  data: string; // AAAA-MM-DD
  horario: string;
  numeros: Numeros;
  linkPainel: string;
  /** src do logo branco: "cid:..." no envio (imagem embutida), data URI na prévia */
  logo: string;
};

function Numero({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <Column align="center" style={{ width: "33%", padding: "0 6px", verticalAlign: "top" }}>
      <Text style={{ margin: 0, fontFamily: WS, fontSize: 40, lineHeight: "44px", fontWeight: 300, color: valor ? cor : C.cinza2 }}>{fmt(valor)}</Text>
      <Text style={{ margin: "6px 0 0", fontFamily: RB, fontSize: 13, lineHeight: "17px", color: C.cinza1 }}>{rotulo}</Text>
    </Column>
  );
}

export default function NewsletterGestor({ nome, periodo, data, horario, numeros: n, linkPainel, logo }: NewsletterProps) {
  const tarde = periodo === "tarde";
  const primeiro = nome.split(" ")[0] || "time";
  const saudacao = tarde ? `Boa noite, ${primeiro}.` : `Bom dia, ${primeiro}.`;
  const acao = n.vencidas + n.hoje;
  const total = n.vencidas + n.hoje + n.radar;

  const destaque = tarde
    ? `${fmt(n.concluidas)} de ${fmt(total)} ${pl(total, "demanda resolvida", "demandas resolvidas")} hoje.`
    : acao
      ? `${fmt(acao)} ${pl(acao, "demanda pede", "demandas pedem")} sua ação hoje.`
      : "Nada vencido nem vencendo hoje na sua carteira.";

  const numeros = tarde
    ? [
        { valor: n.atrasadasAbertas, rotulo: pl(n.atrasadasAbertas, "atrasada em aberto", "atrasadas em aberto"), cor: C.ferrugem },
        { valor: n.viramAtraso, rotulo: pl(n.viramAtraso, "vira atraso amanhã", "viram atraso amanhã"), cor: C.ambar },
        { valor: n.concluidas, rotulo: pl(n.concluidas, "resolvida hoje", "resolvidas hoje"), cor: C.teal },
      ]
    : [
        { valor: n.vencidas, rotulo: "com prazo vencido", cor: C.ferrugem },
        { valor: n.hoje, rotulo: pl(n.hoje, "vence hoje", "vencem hoje"), cor: C.ambar },
        { valor: n.radar, rotulo: "nos próximos 2 dias", cor: C.teal },
      ];

  return (
    <Html lang="pt-BR">
      <Head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;600;700&family=Roboto:wght@400&display=swap" />
      </Head>
      <Preview>{`${destaque} Abra o painel para ver por onde começar.`}</Preview>
      <Body style={{ margin: 0, padding: "32px 12px", background: C.fundo, fontFamily: RB }}>
        <Container style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
          <Section style={{ background: C.navy, borderRadius: "20px 20px 0 0", padding: "32px 36px 34px" }}>
            <Img src={logo} alt="BR MED" width={132} height={30} style={{ display: "block", width: 132, height: 30 }} />
            <Text style={{ margin: "28px 0 0", fontFamily: WS, fontSize: 30, lineHeight: "36px", fontWeight: 300, color: "#FFFFFF" }}>{saudacao}</Text>
            <Text style={{ margin: "6px 0 0", fontFamily: WS, fontSize: 22, lineHeight: "29px", fontWeight: 600, color: "#FFFFFF" }}>{destaque}</Text>
          </Section>

          <Section style={{ background: "#FFFFFF", padding: "32px 24px 8px" }}>
            <Row>
              {numeros.map((x) => (
                <Numero key={x.rotulo} {...x} />
              ))}
            </Row>
          </Section>

          <Section style={{ background: "#FFFFFF", borderRadius: "0 0 20px 20px", padding: "28px 36px 36px", textAlign: "center" }}>
            <Button
              href={linkPainel}
              style={{
                background: C.teal,
                color: "#FFFFFF",
                borderRadius: 99,
                padding: "15px 34px",
                fontFamily: WS,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {tarde ? "Ver o fechamento da carteira" : "Ver minha carteira no painel"}
            </Button>
          </Section>

          <Text style={{ margin: "20px 0 0", textAlign: "center", fontFamily: RB, fontSize: 12, lineHeight: "18px", color: C.cinza1 }}>
            {`Briefing Suporte · enviado automaticamente às ${horario}`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
