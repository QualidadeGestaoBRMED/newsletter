// Agendador da Vercel: ela chama as rotas de /api/cron com "Authorization: Bearer <CRON_SECRET>".
import { timingSafeEqual } from "node:crypto";

// sem segredo configurado, ninguém passa
export const cronAutorizado = (cabecalho: string | null, segredo = process.env.CRON_SECRET?.trim()) => {
  if (!segredo || !cabecalho) return false;
  const a = Buffer.from(cabecalho), b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
};
