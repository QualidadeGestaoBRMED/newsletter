// Triagem do Radar: a IA decide o que é sobre o cliente, junta o que fala do mesmo fato e traduz em ação para o gestor.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { TIPOS_SINAL, type Prioridade, type TipoSinal } from "../lib/radar";
import type { ItemColetado } from "./radar-regras";

const MODELO = () => process.env.RADAR_MODELO?.trim() || "claude-opus-5-5";
const ESFORCO = () => (process.env.RADAR_ESFORCO?.trim() || "low") as "low" | "medium" | "high";

const SinalIA = z.object({
  titulo: z.string().describe("Manchete curta e factual, em português, com o nome do cliente."),
  resumo: z.string().describe("O que isso significa para a BR MED, em 1 ou 2 frases. Cruze com as unidades que atendemos quando fizer sentido."),
  proximo_passo: z.string().describe("Uma ação concreta para o gestor de conta, começando com verbo no infinitivo."),
  tipo: z.enum(TIPOS_SINAL),
  prioridade: z.enum(["agir", "acompanhar", "contexto"]),
  publicado_em: z.string().nullable().describe("Data do fato em AAAA-MM-DD, a mais antiga entre as fontes; null se nenhuma fonte tem data."),
  fontes: z.array(z.number().int()).min(1).describe("Índices dos itens que sustentam o sinal; o primeiro é a melhor fonte."),
});
const Triagem = z.object({ sinais: z.array(SinalIA) });

export type SinalTriado = {
  titulo: string;
  resumo: string;
  proximo_passo: string;
  tipo: TipoSinal;
  prioridade: Prioridade;
  publicado_em: string | null;
  fontes: number[];
};

const SISTEMA = `Você faz a triagem do "Radar de clientes" da BR MED, empresa brasileira de saúde e segurança do trabalho (SST).
A BR MED faz para os clientes: PGR (programa de gerenciamento de riscos), PCMSO, exames ocupacionais (admissional, periódico, demissional, ASO de embarque offshore), NR-01 (riscos psicossociais), laudos e gestão de afastamentos. Quem lê é o gestor de conta do cliente.

Você recebe um cliente (grupo econômico), as unidades dele que a BR MED atende e uma lista numerada de publicações coletadas da web e do LinkedIn. Devolva só os sinais que importam para o gestor:
- Descarte o que não é sobre este cliente (homônimos, outra empresa com nome parecido, notícia de setor sem o cliente), cotação de ações e propaganda sem efeito na operação.
- Junte num sinal só as publicações sobre o mesmo fato.
- Prioridade "agir": muda a operação de SST do cliente em semanas (contratação em massa, nova unidade, obra ou embarcação nova, fusão/aquisição, acidente, fiscalização, desmobilização). "acompanhar": relevante, sem ação imediata. "contexto": vale saber, sem ação.
- O resumo diz o que o fato significa para a BR MED (ex.: pico de admissionais, PGR desatualizado, unidade fora da nossa base, risco de perder o contrato). Se a unidade citada aparece entre as que atendemos, diga isso; se claramente não aparece, diga que está fora da nossa base.
- Não invente nada além do que as publicações dizem. Não cite nome de pessoa física que não seja executivo da empresa (nunca vítimas, candidatos ou funcionários).
- Escreva em português do Brasil, frases curtas.
Se nada servir, devolva sinais vazio.`;

let cliente: Anthropic | null = null;

/** Tokens gastos na execução, para o log. */
export const uso = { entrada: 0, saida: 0, chamadas: 0 };

export async function triar(
  grupo: { nome: string; tier: string | null; unidades: string[] },
  itens: ItemColetado[],
): Promise<SinalTriado[]> {
  if (!itens.length) return [];
  cliente ??= new Anthropic(); // ANTHROPIC_API_KEY do ambiente
  const lista = itens
    .map((i, k) => `[${k}] (${i.origem}${i.data ? `, ${i.data}` : ""}) ${i.veiculo}: ${i.titulo}\n${i.trecho}\n${i.url}`)
    .join("\n\n");
  const unidades = grupo.unidades.slice(0, 80).join("; ");

  const r = await cliente.beta.messages.parse({
    model: MODELO(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA,
    output_config: { effort: ESFORCO(), format: betaZodOutputFormat(Triagem) },
    messages: [
      {
        role: "user",
        content: `Cliente: ${grupo.nome} (tier ${grupo.tier ?? "não informado"})\nUnidades atendidas pela BR MED: ${unidades || "não informado"}\n\nPublicações:\n\n${lista}`,
      },
    ],
  });
  uso.chamadas++;
  uso.entrada += r.usage.input_tokens;
  uso.saida += r.usage.output_tokens;

  if (r.stop_reason === "refusal") {
    console.warn(`  triagem recusada para ${grupo.nome}: ${r.stop_details?.category ?? "sem categoria"}`);
    return [];
  }
  if (!r.parsed_output) throw new Error(`Triagem de ${grupo.nome} sem saída estruturada (stop_reason ${r.stop_reason})`);

  // índices fora da lista são descartados; sinal sem fonte válida não entra
  return r.parsed_output.sinais
    .map((s) => ({ ...s, fontes: [...new Set(s.fontes)].filter((k) => k >= 0 && k < itens.length) }))
    .filter((s) => s.fontes.length);
}
