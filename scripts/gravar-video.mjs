// Grava public/tour.html em MP4: quadro a quadro (no tempo exato de cada quadro, então sai liso mesmo se a captura for lenta)
// com a narração de tour/narracao.json posicionada em cada cena e a música de fundo por baixo.
// Uso: FFMPEG=/caminho/do/ffmpeg node scripts/gravar-video.mjs [saida.mp4] [--fps=60] [--escala=1] [--ate=SEGUNDOS]
//   --escala=1.3333333333 grava em 2560×1440; --escala=2 em 3840×2160. Precisa do Google Chrome instalado.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, padrao) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? padrao;
const saida = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "briefing-suporte.mp4";
const FPS = Number(arg("fps", 60)), ESCALA = Number(arg("escala", 1)), ATE = Number(arg("ate", 0));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const PUBLICO = fileURLToPath(new URL("../public/", import.meta.url));
const PORTA = 9400 + Math.floor(Math.random() * 400);

const chrome = spawn("google-chrome", ["--headless=new", "--mute-audio", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", `--user-data-dir=${mkdtempSync(join(tmpdir(), "gravar-"))}`, `--remote-debugging-port=${PORTA}`, "about:blank"], { stdio: "ignore" });
const encerrar = () => chrome.kill();
process.on("exit", encerrar);
process.on("SIGINT", () => process.exit(130));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let alvo;
for (let i = 0; i < 100 && !alvo; i++) {
  await dormir(200);
  try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); pend.delete(d.id); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cmd("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: ESCALA, mobile: false });
await cmd("Page.navigate", { url: `file://${PUBLICO}tour.html?gravar=1` });
for (let i = 0; i < 200 && !(await ev("window.tour?.pronto === true")); i++) await dormir(100);
await dormir(800); // fontes e imagens assentarem

const total = ATE || (await ev("tour.TOTAL_REAL"));
const falas = (await ev("JSON.stringify(tour.falas.map((f) => f && { src: f.a.getAttribute('src'), ini: f.ini, dur: f.dur }))")) ?? "[]";
const todas = JSON.parse(falas).filter(Boolean), trilha = todas.filter((f) => f.ini < total);
const musica = await ev("tour.musica");
const quadros = Math.round(total * FPS);
console.log(`${quadros} quadros (${total.toFixed(1)}s a ${FPS} q/s, ${Math.round(1920 * ESCALA)}×${Math.round(1080 * ESCALA)}), ${trilha.length} falas${musica ? " e música" : ""}`);

// vídeo pela entrada padrão (PNG por quadro) + uma entrada de áudio por fala, cada uma atrasada até a sua cena (+ a música)
const entradas = [...trilha, ...(musica ? [musica] : [])].flatMap((f) => ["-i", join(PUBLICO, f.src)]);
const atrasos = trilha.map((f, i) => `[${i + 1}:a]adelay=${Math.round(f.ini * 1000)}:all=1[a${i}]`).join(";");
// voz em −21 LUFS, o mesmo nível das falas na apresentação. O silêncio até o fim (apad) vem antes do loudnorm:
// ele trabalha com uma janela de 3s à frente e descartava o fim da última fala quando a trilha de voz acabava ali.
let mistura = `${atrasos};${trilha.map((_, i) => `[a${i}]`).join("")}amix=inputs=${trilha.length}:normalize=0,apad=whole_dur=${(total + 3).toFixed(3)},loudnorm=I=-21:TP=-2:LRA=11`;
if (musica) {
  // a mesma curva de ganhoMusica() do tour.html: abaixa em volta de cada fala, entra em 1,5s e sai nos 3s finais
  const TT = (await ev("tour.TOTAL_REAL")).toFixed(3);
  const abaixar = todas.reduce((e, f) => `max(${e},clip(min((t-${(f.ini - 0.3).toFixed(3)})/0.3,(${(f.ini + f.dur + 0.5).toFixed(3)}-t)/0.5),0,1))`, "0");
  const ganho = `pow(10,(${musica.db}+${musica.abaixa}*${abaixar})/20)*clip(min(t/1.5,(${TT}-t)/3),0,1)`;
  mistura += `[vz];[${trilha.length + 1}:a]volume='${ganho}':eval=frame[mu];[vz][mu]amix=inputs=2:normalize=0,alimiter=limit=0.95`;
}
mistura += `,apad,atrim=0:${total.toFixed(3)}[voz]`;
const ff = spawn(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  ...entradas,
  "-filter_complex", mistura,
  "-map", "0:v", "-map", "[voz]",
  // High@4.2 com 4 quadros de referência: o perfil que todo reprodutor e decodificador de hardware aceita em 1080p60
  "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", ESCALA > 1 ? "5.1" : "4.2", "-refs", "4", "-g", String(FPS * 2), "-tag:v", "avc1", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000",
  "-movflags", "+faststart", "-t", total.toFixed(3), saida,
], { stdio: ["pipe", "inherit", "inherit"] });
const fim = new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg saiu com ${c}`)))));

const t0 = Date.now();
for (let f = 0; f < quadros; f++) {
  await ev(`tour.irReal(${(f / FPS).toFixed(4)})`);
  const { result } = await cmd("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(result.data, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % (FPS * 5) === 0 && f) {
    const ritmo = f / ((Date.now() - t0) / 1000);
    console.log(`${(f / FPS).toFixed(0)}s gravados · ${ritmo.toFixed(1)} q/s · faltam ~${Math.ceil((quadros - f) / ritmo / 60)} min`);
  }
}
ff.stdin.end();
await fim;
console.log(`Pronto: ${saida} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
process.exit(0);
