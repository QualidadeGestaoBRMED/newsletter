// Quem pode entrar no painel e quem abre na visão de todos os gestores. Puro, para testar sem o Auth.js.
export const DOMINIO = "grupobrmed.com.br";

type PerfilGoogle = { email?: string | null; email_verified?: boolean | null };

// A trava real do login. O `hd` mandado ao Google e o app "Interno" só filtram a tela de escolha de conta.
export const contaPermitida = (p?: PerfilGoogle | null) =>
  p?.email_verified === true && !!p.email && p.email.trim().toLowerCase().endsWith(`@${DOMINIO}`);

// GESTAO_EMAILS: e-mails separados por vírgula que abrem o painel na visão de todos os gestores
export const listaGestao = (v = process.env.GESTAO_EMAILS ?? "") =>
  new Set(v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
