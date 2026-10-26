import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { DOMINIO, destinoSeguro } from "@/lib/acesso";

export const metadata = { title: "Entrar – Briefing Suporte" };

// códigos que o Auth.js manda em ?error=; AccessDenied é a conta recusada pela trava de domínio
const ERROS: Record<string, string> = {
  AccessDenied: `Essa conta não tem acesso. Entre com o seu e-mail @${DOMINIO}.`,
};

export default async function Entrar({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const destino = destinoSeguro(callbackUrl);
  if (await auth()) redirect(destino);

  return (
    <main className="entrar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="entrar-logo" alt="BR MED" src="/logo-brmed.png" />
      <div className="entrar-card">
        <h1>Briefing Suporte</h1>
        <p>Prazos do cliente, todo dia útil às 07:00.</p>
        {error && (
          <p className="entrar-erro" role="alert">
            {ERROS[error] ?? "Não foi possível entrar. Tente de novo."}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: destino });
          }}
        >
          <button type="submit">Entrar com o Google</button>
        </form>
        <small>Acesso restrito a contas @{DOMINIO}.</small>
      </div>
    </main>
  );
}
