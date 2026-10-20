import type { ReactNode } from "react";

export const metadata = { title: "Acompanhamento de prazos – Suporte" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
