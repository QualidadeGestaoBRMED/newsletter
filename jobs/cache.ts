// Cache local dos itens lidos do Pipefy, para testes sem esperar a leitura completa (tmp/ fica fora do git).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { itensDoDia, type ItemEdicao } from "./edicao";
import type { Aviso, CacheBrnet } from "./pipefy";
import type { Dia } from "./regras";

const CACHE = "tmp/cache-itens.json";

export async function itensComCache(data: Dia, avisos: Aviso[], usarCache: boolean, brnet?: CacheBrnet): Promise<ItemEdicao[]> {
  if (usarCache && existsSync(CACHE)) {
    const c = JSON.parse(await readFile(CACHE, "utf8"));
    if (c.data === data) return c.itens;
  }
  const t0 = Date.now();
  const out = await itensDoDia(data, avisos, brnet);
  console.log(`Pipefy lido em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await mkdir("tmp", { recursive: true });
  await writeFile(CACHE, JSON.stringify({ data, itens: out }));
  return out;
}
