// Login com Google (Auth.js). Lê AUTH_SECRET, AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET do ambiente.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DOMINIO, contaPermitida } from "@/lib/acesso";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { hd: DOMINIO, prompt: "select_account" } } })],
  pages: { signIn: "/entrar", error: "/entrar" },
  callbacks: {
    signIn: ({ profile }) => contaPermitida(profile),
  },
});
