// Gravação das edições no Postgres.
import "./env";
import { and, eq, gt, inArray, sql as q } from "drizzle-orm";
import { db, pool, schema } from "../db";
import { BRNET_VALIDADE_DIAS, type Periodo } from "./config";
import { idEdicao, type ItemEdicao } from "./edicao";
import type { RegistroEnvios } from "./envio";
import type { CacheBrnet } from "./pipefy";
import { normalizar, type Dia } from "./regras";

const LOTE = 1000;

/** Grava (ou regrava) o retrato da edição. Uma edição já enviada não é sobrescrita. */
export async function gravarEdicao(data: Dia, periodo: Periodo, itens: ItemEdicao[]): Promise<string> {
  const id = idEdicao(data, periodo);
  await db.transaction(async (tx) => {
    const [atual] = await tx.select().from(schema.edicoes).where(eq(schema.edicoes.id, id));
    if (atual?.status === "enviada") throw new Error(`Edição ${id} já foi enviada; não regravo o retrato`);

    await tx
      .insert(schema.edicoes)
      .values({ id, data, periodo, status: "gerada" })
      .onConflictDoUpdate({ target: schema.edicoes.id, set: { gerada_em: new Date(), status: "gerada" } });
    await tx.delete(schema.itensEdicao).where(eq(schema.itensEdicao.edicao_id, id));
    for (let i = 0; i < itens.length; i += LOTE) {
      await tx.insert(schema.itensEdicao).values(itens.slice(i, i + LOTE).map((it) => ({ ...it, edicao_id: id })));
    }
  });
  return id;
}

export const cacheBrnet: CacheBrnet = {
  async ler(empresas) {
    const t = schema.brnetEmpresas;
    const validade = new Date(Date.now() - BRNET_VALIDADE_DIAS * 864e5);
    const chaves = [...new Set(empresas.map(normalizar))];
    const out = [];
    for (let i = 0; i < chaves.length; i += LOTE) {
      out.push(...(await db.select().from(t).where(and(inArray(t.chave, chaves.slice(i, i + LOTE)), gt(t.consultado_em, validade)))));
    }
    return out;
  },
  async gravar(consultadas) {
    const t = schema.brnetEmpresas;
    const linhas = [...new Map(consultadas.map((e) => [normalizar(e.empresa), { chave: normalizar(e.empresa), ...e }])).values()];
    for (let i = 0; i < linhas.length; i += LOTE) {
      await db
        .insert(t)
        .values(linhas.slice(i, i + LOTE))
        .onConflictDoUpdate({
          target: t.chave,
          set: { empresa: q`excluded.empresa`, coordenador: q`excluded.coordenador`, tier: q`excluded.tier`, consultado_em: new Date() },
        });
    }
  },
};

/** Status atual da edição, ou null se ainda não foi gerada. */
export async function statusEdicao(id: string) {
  const [e] = await db.select({ status: schema.edicoes.status }).from(schema.edicoes).where(eq(schema.edicoes.id, id));
  return e?.status ?? null;
}

export async function marcarEdicao(id: string, status: "enviada" | "falhou") {
  await db.update(schema.edicoes).set({ status }).where(eq(schema.edicoes.id, id));
}

export const registroEnvios: RegistroEnvios = {
  async jaEnviados(edicao) {
    const r = await db.select({ d: schema.envios.destinatario }).from(schema.envios).where(eq(schema.envios.edicao_id, edicao));
    return new Set(r.map((x) => x.d));
  },
  async registrar(edicao, destinatario, messageId) {
    await db.insert(schema.envios).values({ edicao_id: edicao, destinatario, message_id: messageId }).onConflictDoNothing();
  },
};

export const fecharBanco = () => pool.end();
