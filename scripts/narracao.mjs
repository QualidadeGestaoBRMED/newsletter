// Gera a narração da apresentação (public/tour.html) com a ElevenLabs: um MP3 por cena + tour/narracao.json.
// Uso:
//   node scripts/narracao.mjs vozes            → lista vozes em pt-BR (da sua conta e da biblioteca)
//   node scripts/narracao.mjs gerar [--voz=ID] → gera os áudios (sem --voz: ELEVENLABS_VOICE_ID ou a Matilda)
// Precisa de ELEVENLABS_API_KEY no .env.
import { mkdir, writeFile } from "node:fs/promises";

try {
  process.loadEnvFile();
} catch {
  // sem .env, usa o ambiente
}

const API = "https://api.elevenlabs.io/v1";
const MODELO = "eleven_multilingual_v2";
// Matilda (voz padrão da ElevenLabs, usável no plano gratuito), escolhida em 2026-10-21
const VOZ_PADRAO = "XrExE9yKIg1WjnnlVkGX";
const SAIDA = new URL("../public/tour/", import.meta.url);

// Uma fala por cena, na ordem das cenas do tour.html. Frases curtas, para soar conversado.
const FALAS = [
  "Este é o Briefing Suporte.",
  "Duas vezes por dia útil, ele lê o Pipefy, calcula o prazo de cada demanda e monta o painel.",
  "No topo, os números do dia: o que já venceu, o que vence hoje, e o que vence nos próximos dois dias.",
  "Dá para filtrar por gestor, grupo, empresa, área e tier. E quem chega pelo e-mail já abre na própria carteira.",
  "Em destaque, a demanda mais urgente, com um link direto para o card no Pipefy.",
  "Em Onde atuar, tudo aparece por urgência: primeiro o que venceu, depois o que vence hoje, e o que dá para antecipar.",
  "A visão gerencial compara as carteiras. Quanto mais escura a célula, maior o atraso. E um clique desce de nível.",
  "Em Evolução, você acompanha esses números, edição a edição.",
  "Às sete da manhã, cada gestor recebe um e-mail curto: três números, e um botão que abre o painel.",
  "Briefing Suporte. Os prazos dos clientes, todo dia útil, às sete.",
];

const chave = process.env.ELEVENLABS_API_KEY?.trim();
if (!chave) {
  console.error("Defina ELEVENLABS_API_KEY no .env (ElevenLabs → Profile → API Keys).");
  process.exit(1);
}
const api = async (caminho, init = {}) => {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { "xi-api-key": chave, "Content-Type": "application/json", ...init.headers } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} em ${caminho}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

async function vozes() {
  const { voices } = await api("/voices");
  const minhas = voices.filter((v) => /portug|brazil|pt/i.test(JSON.stringify(v.labels ?? {}) + (v.verified_languages ?? []).map((l) => l.language + l.accent).join(" ")));
  console.log("Na sua conta:");
  for (const v of minhas.length ? minhas : voices) console.log(`  ${v.voice_id}  ${v.name}  ${JSON.stringify(v.labels ?? {})}`);
  const { voices: bib } = await api("/shared-voices?language=pt&accent=brazilian&use_cases=narrative_story&page_size=15&sort=trending");
  console.log("\nBiblioteca (pt-BR, narração):");
  for (const v of bib) console.log(`  ${v.voice_id}  ${v.name}  ${v.gender ?? ""} ${v.age ?? ""}  dono=${v.public_owner_id}  ${v.description?.slice(0, 80) ?? ""}`);
  console.log("\nPara usar uma da biblioteca: node scripts/narracao.mjs adicionar --dono=<dono> --voz=<id>");
}

async function adicionar() {
  const r = await api(`/voices/add/${arg("dono")}/${arg("voz")}`, { method: "POST", body: JSON.stringify({ new_name: arg("nome") ?? "Narração Briefing" }) });
  console.log(`Voz adicionada à conta: ${r.voice_id}`);
}

async function gerar() {
  const voz = arg("voz") ?? process.env.ELEVENLABS_VOICE_ID?.trim() ?? VOZ_PADRAO;
  await mkdir(SAIDA, { recursive: true });
  const falas = [];
  for (const [i, texto] of FALAS.entries()) {
    const r = await api(`/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      body: JSON.stringify({
        text: texto,
        model_id: MODELO,
        language_code: "pt",
        // texto vizinho deixa a entonação contínua entre as cenas
        previous_text: FALAS[i - 1],
        next_text: FALAS[i + 1],
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 0.95 },
      }),
    });
    const arquivo = `narracao-${String(i + 1).padStart(2, "0")}.mp3`;
    await writeFile(new URL(arquivo, SAIDA), Buffer.from(r.audio_base64, "base64"));
    const fim = r.alignment?.character_end_times_seconds?.at(-1) ?? 0;
    falas.push({ arquivo, duracao: Math.round((fim + 0.15) * 100) / 100, texto });
    console.log(`${arquivo}  ${fim.toFixed(2)}s  ${texto}`);
  }
  await writeFile(new URL("narracao.json", SAIDA), JSON.stringify({ voz, modelo: MODELO, gerado_em: new Date().toISOString(), falas }, null, 2));
  console.log(`\n${falas.length} falas em public/tour/. Rode npm run build para o servidor de produção servir os arquivos novos.`);
}

const cmd = process.argv[2];
const acoes = { vozes, adicionar, gerar };
if (!acoes[cmd]) {
  console.error("Uso: node scripts/narracao.mjs vozes | adicionar --dono=ID --voz=ID | gerar [--voz=ID]");
  process.exit(1);
}
acoes[cmd]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
