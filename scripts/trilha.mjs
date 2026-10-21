// Gera a música de fundo da apresentação (public/tour/trilha.mp3): pop alegre a 124 BPM, em ré maior e só com acordes maiores,
// sintetizado aqui mesmo (sem licença de terceiros). Determinístico: rodar de novo produz o mesmo arquivo.
// Uso: FFMPEG=/caminho/do/ffmpeg node scripts/trilha.mjs [--segundos=180]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, padrao) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? padrao;
const SEG = Number(arg("segundos", 180)), SR = 48000, N = SEG * SR;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const SAIDA = fileURLToPath(new URL("../public/tour/trilha.mp3", import.meta.url));

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = 124, B = 60 / BPM, COMPASSO = 4 * B;
// D → G → D → A (I–IV–I–V), um acorde por compasso. `mel`: o tema em colcheias na pentatônica maior (null = pausa)
const ACORDES = [
  { baixo: 38, pad: [62, 66, 69], mel: [74, null, 78, 81, null, 78, 81, 83] },
  { baixo: 43, pad: [62, 67, 71], mel: [83, null, 81, 79, null, 81, 83, null] },
  { baixo: 38, pad: [62, 66, 69], mel: [81, null, 78, 74, null, 76, 78, 81] },
  { baixo: 45, pad: [61, 64, 69], mel: [76, null, 78, 81, null, 83, 85, null] },
];
// aleatório com semente: humaniza tempo e intensidade sem mudar a cada execução
let semente = 11;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);

const L = new Float32Array(N), R = new Float32Array(N);
const somar = (i, v, pan) => { if (i >= 0 && i < N) { L[i] += v * Math.min(1, 2 * (1 - pan)); R[i] += v * Math.min(1, 2 * pan); } };
const nota = (t0, dur, fn, pan = 0.5) => { const i0 = Math.floor(t0 * SR); for (let j = 0; j < dur * SR; j++) somar(i0 + j, fn(j / SR), pan); };
const sen = (f, t) => Math.sin(2 * Math.PI * f * t);
// marimba: fundamental com decaimento médio + batida de baqueta (4º harmônico curto)
const marimba = (f, vel) => (t) => vel * Math.min(1, t / 0.002) * (Math.exp(-t / 0.32) * sen(f, t) + 0.35 * Math.exp(-t / 0.04) * sen(f * 4, t));

const nCompassos = Math.ceil(SEG / COMPASSO);
for (let c = 0; c < nCompassos; c++) {
  const { baixo, pad, mel } = ACORDES[c % ACORDES.length], ini = c * COMPASSO, cheio = c >= 1; // o 1º compasso entra sem bateria

  // acordes curtos ("stabs") nos contratempos, brilhantes, como um teclado de pop
  for (let e = 1; e < 8; e += 2)
    for (const m of [...pad, pad[0] + 12]) nota(ini + e * (B / 2), 0.3, (t) => 0.018 * Math.min(1, t / 0.004) * Math.exp(-t / 0.09) * (sen(hz(m), t) + 0.5 * sen(hz(m) * 2, t) + 0.25 * sen(hz(m) * 3, t)), 0.35 + 0.1 * (m % 4));

  // tema na marimba, com eco de colcheia pontuada no lado oposto
  mel.forEach((m, e) => {
    if (m == null) return;
    const t0 = ini + e * (B / 2) + (rnd() - 0.5) * 0.006, vel = 0.11 * (0.85 + 0.15 * rnd());
    nota(t0, 1.4, marimba(hz(m), vel), 0.42);
    nota(t0 + 0.75 * B, 1.4, marimba(hz(m), vel * 0.3), 0.75);
  });

  // baixo saltitante: tônica no tempo 1 e nos contratempos, oitava acima no último
  [[0, 0, 0.12], [0.5, 0, 0.09], [1.5, 0, 0.09], [2.5, 0, 0.09], [3.5, 12, 0.08]].forEach(([tempo, oit, vel]) => {
    const f = hz(baixo + oit);
    nota(ini + tempo * B, B * 0.45, (t) => vel * Math.min(1, t / 0.004) * Math.exp(-t / 0.18) * (sen(f, t) + 0.5 * sen(2 * f, t) + 0.2 * sen(3 * f, t)));
  });

  if (!cheio) continue;
  for (let tempo = 0; tempo < 4; tempo++) {
    const tb = ini + tempo * B;
    // bumbo em todos os tempos
    nota(tb, 0.25, (t) => 0.2 * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * (50 * t + (90 / 35) * (1 - Math.exp(-t * 35)))));
    // palma no 2 e no 4 (três estalos de ruído bem juntos)
    if (tempo % 2) for (const d of [0, 0.011, 0.023]) nota(tb + d, 0.15, (t) => 0.05 * Math.exp(-t / (d ? 0.012 : 0.06)) * (rnd() * 2 - 1));
    // chimbal: aberto no contratempo, fechado nas semicolcheias
    for (const [d, v, dec, pan] of [[0.5, 0.045, 0.07, 0.62], [0.25, 0.018, 0.015, 0.38], [0.75, 0.018, 0.015, 0.38]]) {
      let ant = 0;
      nota(tb + d * B, dec * 5, (t) => { const r = rnd() * 2 - 1, alto = r - ant; ant = r; return v * Math.exp(-t / dec) * alto; }, pan);
    }
  }
}

// entrada suave, normaliza o pico e entrega ao ffmpeg (eco curto, sem graves sobrando)
const entrada = 1 * SR;
let pico = 0;
for (let i = 0; i < N; i++) { if (i < entrada) { L[i] *= i / entrada; R[i] *= i / entrada; } pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i])); }
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round((L[i] / pico) * 0.8 * 32767), i * 4); pcm.writeInt16LE(Math.round((R[i] / pico) * 0.8 * 32767), i * 4 + 2); }

const ff = spawn(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(SR), "-ac", "2", "-i", "-",
  "-af", "aecho=0.85:0.35:41:0.12,highpass=f=40,loudnorm=I=-20:TP=-2:LRA=11",
  "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", SAIDA], { stdio: ["pipe", "inherit", "inherit"] });
ff.stdin.end(pcm);
ff.on("close", (c) => { if (c) process.exit(c); console.log(`Pronto: public/tour/trilha.mp3 (${SEG}s)`); });
