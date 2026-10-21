// Gera a música de fundo da apresentação (public/tour/trilha.mp3): ambiente calmo em ré maior, sintetizado aqui mesmo
// (sem licença de terceiros). Determinístico: rodar de novo produz o mesmo arquivo.
// Uso: FFMPEG=/caminho/do/ffmpeg node scripts/trilha.mjs [--segundos=180]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, padrao) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? padrao;
const SEG = Number(arg("segundos", 180)), SR = 48000, N = SEG * SR;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SAIDA = fileURLToPath(new URL("../public/tour/trilha.mp3", import.meta.url));

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = 72, TEMPO = 60 / BPM, ACORDE = 8 * TEMPO; // um acorde a cada dois compassos
// Dmaj9 → Bm9 → Gmaj9 → Asus: baixo, pad (notas próximas, para a troca soar macia) e as notas do arpejo
const ACORDES = [
  { baixo: 38, pad: [54, 57, 61, 64], arp: [69, 73, 76, 78] },
  { baixo: 47, pad: [54, 57, 61, 62], arp: [66, 69, 73, 74] },
  { baixo: 43, pad: [54, 57, 59, 62], arp: [66, 71, 74, 78] },
  { baixo: 45, pad: [52, 57, 59, 62], arp: [64, 69, 71, 76] },
];
// aleatório com semente: humaniza tempo e intensidade das notas sem mudar a cada execução
let semente = 7;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);

const L = new Float32Array(N), R = new Float32Array(N);
const somar = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// pad: três osciladores levemente desafinados por nota, abertos no estéreo, com entrada e saída lentas
const nAcordes = Math.ceil(SEG / ACORDE) + 1;
for (let c = 0; c < nAcordes; c++) {
  const { baixo, pad } = ACORDES[c % ACORDES.length], ini = c * ACORDE, fim = ini + ACORDE + 2.5;
  const env = (t) => Math.min(1, t / 2.2) * Math.min(1, Math.max(0, (fim - (ini + t)) / 2.5));
  const i0 = Math.floor(ini * SR), i1 = Math.min(N, Math.ceil(fim * SR));
  for (const m of pad) {
    const f = hz(m), fases = [rnd(), rnd(), rnd()].map((x) => x * 2 * Math.PI);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR, e = env(t) * 0.05 * (1 + 0.12 * Math.sin(2 * Math.PI * 0.21 * t + m));
      const a = Math.sin(2 * Math.PI * f * t + fases[0]), b = Math.sin(2 * Math.PI * f * 1.0035 * t + fases[1]), d = Math.sin(2 * Math.PI * f * 0.9965 * t + fases[2]);
      const h = 0.18 * Math.sin(2 * Math.PI * f * 2 * t + fases[0]);
      somar(i, e * (a + 0.8 * b + 0.3 * d + h), e * (a + 0.3 * b + 0.8 * d + h));
    }
  }
  // baixo: senoide com um pouco de 2º e 3º harmônico, para aparecer também em alto-falante de notebook
  const fb = hz(baixo);
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR, e = env(t) * 0.075;
    const v = e * (Math.sin(2 * Math.PI * fb * t) + 0.35 * Math.sin(4 * Math.PI * fb * t) + 0.12 * Math.sin(6 * Math.PI * fb * t));
    somar(i, v, v);
  }
}

// arpejo de piano elétrico: notas esparsas, ataque curto e decaimento longo, alternando lados
const PADRAO = [[0, 0], [1.5, 2], [3, 1], [4, 3], [5.5, 2], [7, 1]];
for (let c = 0; c < nAcordes; c++) {
  const { arp } = ACORDES[c % ACORDES.length];
  for (const [batida, k] of PADRAO) {
    const t0 = c * ACORDE + batida * TEMPO + (rnd() - 0.5) * 0.02, vel = 0.05 * (0.7 + 0.3 * rnd());
    const f = hz(arp[k]), pan = 0.5 + 0.3 * (k % 2 ? 1 : -1), i0 = Math.floor(t0 * SR);
    for (let j = 0; j < 4 * SR; j++) {
      const t = j / SR, ataque = Math.min(1, t / 0.004);
      const v = vel * ataque * (Math.exp(-t / 1.1) * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.exp(-t / 0.18) * Math.sin(2 * Math.PI * f * 2 * t) + 0.08 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * f * 4.2 * t));
      somar(i0 + j, v * (1 - pan), v * pan);
    }
  }
}

// entrada suave, normaliza o pico e entrega ao ffmpeg (eco curto como ambiência, sem graves e agudos sobrando)
const entrada = 3 * SR;
let pico = 0;
for (let i = 0; i < N; i++) { if (i < entrada) { L[i] *= i / entrada; R[i] *= i / entrada; } pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i])); }
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round((L[i] / pico) * 0.8 * 32767), i * 4); pcm.writeInt16LE(Math.round((R[i] / pico) * 0.8 * 32767), i * 4 + 2); }

const ff = spawn(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(SR), "-ac", "2", "-i", "-",
  "-af", "aecho=0.8:0.55:61|113|179|263:0.3|0.22|0.15|0.1,highpass=f=70,lowpass=f=6000,loudnorm=I=-20:TP=-2:LRA=11",
  "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", SAIDA], { stdio: ["pipe", "inherit", "inherit"] });
ff.stdin.end(pcm);
ff.on("close", (c) => { if (c) process.exit(c); console.log(`Pronto: public/tour/trilha.mp3 (${SEG}s)`); });
