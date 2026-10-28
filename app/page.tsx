import { Suspense } from "react";
import { auth } from "@/auth";
import { gestorDe } from "@/lib/gestor";
import Painel from "./painel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sessao = await auth();
  const email = sessao?.user?.email?.toLowerCase() ?? "";
  return (
    <Suspense>
      <Painel gestorInicial={await gestorDe(email)} />
    </Suspense>
  );
}
