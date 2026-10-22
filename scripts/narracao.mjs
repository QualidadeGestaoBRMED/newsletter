// Gera a narração das apresentações com a ElevenLabs: um MP3 por cena + o manifesto do roteiro em public/tour/.
//   tour  → public/tour.html (tour do produto), manifesto tour/narracao.json
//   tour2 → public/tour2.html (versão executiva: "as is" antes do produto, roadmap com indicadores), tour/narracao-tour2.json
// Uso:
//   node scripts/narracao.mjs vozes                                  → lista vozes em pt-BR (da sua conta e da biblioteca)
//   node scripts/narracao.mjs gerar [--roteiro=tour|tour2] [--voz=ID] → gera os áudios (sem --voz: ELEVENLABS_VOICE_ID ou a Carla)
// Precisa de ELEVENLABS_API_KEY no .env e de ffmpeg (variável FFMPEG ou no PATH) para nivelar o volume das falas.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
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
// Perfis de voz (velocidade: a ElevenLabs aceita de 0.7 a 1.2). "expressivo" foi escolhido para a versão executiva em
// 2026-10-22, por soar mais natural: velocidade normal, menos estabilidade e mais estilo.
const PERFIS = {
  padrao: { velocidade: 1.1, stability: 0.5, style: 0.2 },
  expressivo: { velocidade: 1.0, stability: 0.35, style: 0.45 },
};
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
  {
    texto:
      "Em Onde atuar, as demandas vêm em três colunas: primeiro, o que já venceu, das mais antigas para as mais novas; depois, o que vence hoje; e por fim, o que dá para antecipar. Cada linha mostra a área, o grupo e o tíer do cliente: Diamante, Ouro, Prata ou Bronze.",
    marcas: { c1: "primeiro", c2: "depois", c3: "por fim", tier: "tíer" },
  },
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

// Versão executiva: o problema (dados do Pipefy de 21/10/2026: 78% vencidas, 709 há mais de 30 dias, 47% das vencidas em
// Diamante e Ouro), o porquê (1.240 cards em 31 fases) e a virada para a solução; depois as falas do produto e o roadmap com indicadores.
const FALAS_EXEC = [
  FALAS[0],
  {
    texto:
      "Hoje, quase oito em cada dez demandas dos nossos clientes estão com o prazo vencido. E muitas não estão só atrasadas: estão esquecidas. Mais de setecentas venceram há mais de um mês. E quase metade é de clientes Diamante e Ouro. Ou seja: é receita em risco.",
    marcas: { vencidas: "oito", esquecidas: "setecentas", receita: "metade", risco: "Ou seja" },
  },
  {
    texto:
      "Mas por que isso acontece? São mais de mil cards abertos, espalhados em trinta fases do Pipefy. Ninguém enxerga a carteira inteira. E o que ninguém vê, fica para trás. Então, como resolver? Levando essa visibilidade até cada gestor, todo dia, sem esforço nenhum. É isso que o Briefing faz.",
    marcas: { porque: "por que", mil: "mil", ninguem: "Ninguém", resolver: "resolver", gestor: "cada gestor", dia: "todo dia", esforco: "sem esforço" },
  },
  ...FALAS.slice(1, 9),
  {
    texto:
      "E isso é só o começo. No piloto, a hipótese é simples: com visibilidade todos os dias, o Suporte cobra as áreas a tempo, evita novos atrasos e resgata os cards esquecidos. Depois, vem o resumo do cliente: notícias e movimentos de cada empresa, para o gestor chegar informado, fortalecer o relacionamento e aumentar a retenção. Em seguida, a satisfação de cada carteira, lado a lado com os prazos. E, por fim, o risco de churn: sinais de que um cliente pode sair, para agir antes que seja tarde demais, e não perder receita.",
    marcas: { prazos: "piloto", resumo: "resumo", nps: "satisfação", churn: "churn" },
  },
  "Briefing Suporte, um desenvolvimento interno da Qualidade e Gestão. Os prazos dos clientes, todo dia útil, às sete.",
];

const ROTEIROS = {
  tour: { falas: FALAS, manifesto: "narracao.json", perfil: "padrao" },
  tour2: { falas: FALAS_EXEC, manifesto: "narracao-tour2.json", perfil: "expressivo" },
};

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
  const roteiro = ROTEIROS[arg("roteiro") ?? "tour"];
  if (!roteiro) throw new Error(`Roteiro desconhecido; use ${Object.keys(ROTEIROS).join(" ou ")}`);
  const FALAS = roteiro.falas, perfil = PERFIS[roteiro.perfil];
  await mkdir(SAIDA, { recursive: true });
  // fala com o mesmo texto, voz e velocidade já gerada em qualquer roteiro é reaproveitada (não gasta créditos)
  const prontas = [];
  for (const nome of readdirSync(SAIDA).filter((n) => /^narracao.*\.json$/.test(n))) {
    const m = JSON.parse(await readFile(new URL(nome, SAIDA), "utf8"));
    if (m.voz === voz && (m.perfil ?? "padrao") === roteiro.perfil && (m.velocidade ?? 0.95) === perfil.velocidade) prontas.push(...m.falas);
  }
  const textos = FALAS.map((f) => (typeof f === "string" ? f : f.texto));
  const falas = [];
  for (const [i, fala] of FALAS.entries()) {
    const texto = textos[i], marcasPedidas = typeof fala === "string" ? null : fala.marcas;
    const pronta = prontas.find((f) => f.texto === texto && existsSync(new URL(f.arquivo, SAIDA)));
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
        voice_settings: { stability: perfil.stability, similarity_boost: 0.8, style: perfil.style, use_speaker_boost: true, speed: perfil.velocidade },
      }),
    });
    const arquivo = `fala-${createHash("sha1").update(voz + perfil.velocidade + (roteiro.perfil === "padrao" ? "" : roteiro.perfil) + texto).digest("hex").slice(0, 10)}.mp3`;
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
  await writeFile(new URL(roteiro.manifesto, SAIDA), JSON.stringify({ voz, perfil: roteiro.perfil, velocidade: perfil.velocidade, modelo: MODELO, gerado_em: new Date().toISOString(), falas }, null, 2));
  console.log(`\n${falas.length} falas em public/tour/. Rode npm run build para o servidor de produção servir os arquivos novos.`);
}

const cmd = process.argv[2];
const acoes = { vozes, adicionar, gerar };
if (!acoes[cmd]) {
  console.error("Uso: node scripts/narracao.mjs vozes | adicionar --dono=ID --voz=ID | gerar [--roteiro=tour|tour2] [--voz=ID]");
  process.exit(1);
}
acoes[cmd]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
