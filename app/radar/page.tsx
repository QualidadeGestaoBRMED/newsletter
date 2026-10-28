import { Suspense } from "react";
import { auth } from "@/auth";
import { gestorDe } from "@/lib/gestor";
import Radar from "./radar";
import "./radar.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar de clientes · Briefing Suporte" };

export default async function Page() {
  const sessao = await auth();
  const email = sessao?.user?.email?.toLowerCase() ?? "";
  return (
    <Suspense>
      <Radar gestorInicial={await gestorDe(email)} />
    </Suspense>
  );
}
