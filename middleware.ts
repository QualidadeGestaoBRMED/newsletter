// Tudo exige login com conta da BR MED, menos a tela de entrada, as rotas do Auth.js, o logo e as rotas do agendador
// da Vercel (/api/cron), que se protegem pelo CRON_SECRET.
// As APIs respondem 401 em vez de redirecionar; cada uma também confere a sessão por conta própria.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  if (req.auth) return;
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  const entrar = new URL("/entrar", req.nextUrl.origin);
  entrar.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(entrar);
});

export const config = {
  matcher: ["/((?!api/auth|api/cron|entrar|_next/static|_next/image|favicon.ico|logo-brmed.png).*)"],
};
