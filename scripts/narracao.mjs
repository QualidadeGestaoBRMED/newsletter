// Gera a narração da apresentação (public/tour.html) com a ElevenLabs: um MP3 por cena + tour/narracao.json.
// Uso:
//   node scripts/narracao.mjs vozes            → lista vozes em pt-BR (da sua conta e da biblioteca)
//   node scripts/narracao.mjs gerar [--voz=ID] → gera os áudios (sem --voz: ELEVENLABS_VOICE_ID ou a Carla)
// Precisa de ELEVENLABS_API_KEY no .env e de ffmpeg (variável FFMPEG ou no PATH) para nivelar o volume das falas.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile();
} catch {
  // sem .env, usa o ambiente
}

const API = "https://api.elevenlabs.io/v1";
const MODELO = "eleven_multilingual_v2";
// Carla ("Inviting, Warm and Helpful"), voz brasileira da biblioteca (exige plano pago), escolhida em 2026-10-21.
// Anteriores: Lucas SVgp5d1fyFQRW1eQbwkq (0.95), Matilda XrExE9yKIg1WjnnlVkGX (0.95)
const VOZ_PADRAO = "m151rjrbWXbBqyq56tly";
const VELOCIDADE = 1.1; // a ElevenLabs aceita de 0.7 a 1.2
const SAIDA = new URL("../public/tour/", import.meta.url);
// cada voz sai num volume; todas as falas são niveladas para este alvo (o vídeo usa o mesmo)
const LUFS = -21;
const FFMPEG = process.env.FFMPEG || "ffmpeg";

// Uma fala por cena, na ordem das cenas do tour.html. Frases curtas, para soar conversado.
// Palavras escritas como se falam: "tíer" (tier); a tela mantém a grafia certa. ("Paipefai" servia para a Matilda; a Carla já diz "Pipefy".)
// Uma fala com `marcas` registra quando cada palavra começa, para a cena sincronizar a animação com a voz.
const FALAS = [
  "Este é o Briefing Suporte.",
  "Duas vezes por dia útil, ele lê o Pipefy, calcula o prazo de cada demanda e monta o painel.",
  "No topo, os números do dia: o que já venceu, o que vence hoje, e o que vence nos próximos dois dias.",
  "Dá para filtrar por gestor, grupo, empresa, área e tíer. E quem chega pelo e-mail já abre na própria carteira.",
  "Em destaque, a demanda mais urgente, com um link direto para o card no Pipefy.",
  "Em Onde atuar, tudo aparece por urgência: primeiro o que venceu, depois o que vence hoje, e o que dá para antecipar.",
  {
    texto:
      "Na visão gerencial, você vê onde cada demanda está, e com quem. Nas colunas, a área: Segurança, Saúde e On-Going. Nas linhas, o gestor. Quanto mais escura a célula, maior o atraso. Um clique no gestor abre a carteira dele; outro clique, as empresas de cada grupo.",
    marcas: { onde: "onde", area: "área", linhas: "linhas", escura: "escura", clique: "clique", outro: "outro" },
  },
  "Em Evolução, você acompanha esses números, edição a edição.",
  "Às sete da manhã, cada gestor recebe um e-mail curto: três números, e um botão que abre o painel.",
  {
    texto:
      "E isso é só o começo. Hoje, no piloto, o Briefing cuida dos prazos. Os próximos passos são o resumo do cliente, com notícias e movimentos, para o gestor chegar informado; e a satisfação da carteira, ao lado dos prazos. Depois, o risco de churn: sinais de que um cliente pode sair, antes que ele avise.",
    marcas: { prazos: "prazos", resumo: "resumo", nps: "satisfação", churn: "churn" },
  },
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

// loudnorm em duas passadas (medir, depois ganho linear): muda só o volume, sem comprimir a fala
function nivelar(arquivo) {
  const caminho = fileURLToPath(new URL(arquivo, SAIDA)), alvo = `I=${LUFS}:TP=-1.5:LRA=11`;
  const log = spawnSync(FFMPEG, ["-hide_banner", "-i", caminho, "-af", `loudnorm=${alvo}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(log.slice(log.lastIndexOf("{")));
  const tmp = caminho.replace(/\.mp3$/, ".nivel.mp3");
  execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", caminho, "-af",
    `loudnorm=${alvo}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", tmp]);
  execFileSync("mv", [tmp, caminho]);
}

async function gerar() {
  const voz = arg("voz") ?? process.env.ELEVENLABS_VOICE_ID?.trim() ?? VOZ_PADRAO;
  await mkdir(SAIDA, { recursive: true });
  // fala com o mesmo texto e a mesma voz já gerada é reaproveitada (não gasta créditos)
  const anterior = existsSync(new URL("narracao.json", SAIDA)) ? JSON.parse(await readFile(new URL("narracao.json", SAIDA), "utf8")) : null;
  const textos = FALAS.map((f) => (typeof f === "string" ? f : f.texto));
  const falas = [];
  for (const [i, fala] of FALAS.entries()) {
    const texto = textos[i], marcasPedidas = typeof fala === "string" ? null : fala.marcas;
    const pronta = anterior?.voz === voz && (anterior.velocidade ?? 0.95) === VELOCIDADE && anterior.falas.find((f) => f.texto === texto && existsSync(new URL(f.arquivo, SAIDA)));
    if (pronta && (!marcasPedidas || pronta.marcas)) {
      if (pronta.lufs !== LUFS) { nivelar(pronta.arquivo); pronta.lufs = LUFS; }
      falas.push(pronta);
      console.log(`${pronta.arquivo}  reaproveitada`);
      continue;
    }
    const r = await api(`/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      body: JSON.stringify({
        text: texto,
        model_id: MODELO,
        language_code: "pt",
        // texto vizinho deixa a entonação contínua entre as cenas
        previous_text: textos[i - 1],
        next_text: textos[i + 1],
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: VELOCIDADE },
      }),
    });
    const arquivo = `fala-${createHash("sha1").update(voz + VELOCIDADE + texto).digest("hex").slice(0, 10)}.mp3`;
    await writeFile(new URL(arquivo, SAIDA), Buffer.from(r.audio_base64, "base64"));
    nivelar(arquivo);
    const al = r.alignment;
    const fim = al?.character_end_times_seconds?.at(-1) ?? 0;
    const item = { arquivo, duracao: Math.round((fim + 0.15) * 100) / 100, texto, lufs: LUFS };
    if (marcasPedidas && al) {
      // segundo em que cada palavra marcada começa a ser dita
      const dito = al.characters.join("");
      item.marcas = Object.fromEntries(Object.entries(marcasPedidas).map(([k, palavra]) => [k, al.character_start_times_seconds[dito.indexOf(palavra)] ?? null]));
    }
    falas.push(item);
    console.log(`${arquivo}  ${fim.toFixed(2)}s  ${texto}`);
  }
  await writeFile(new URL("narracao.json", SAIDA), JSON.stringify({ voz, velocidade: VELOCIDADE, modelo: MODELO, gerado_em: new Date().toISOString(), falas }, null, 2));
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
