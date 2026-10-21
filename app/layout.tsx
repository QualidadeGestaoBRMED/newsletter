import { Roboto, Work_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./painel.css";

const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-ws", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["300", "400", "500", "700"], variable: "--font-rb", display: "swap" });

export const metadata = { title: "Briefing Suporte" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${workSans.variable} ${roboto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
