import type { NextConfig } from "next";

const config: NextConfig = {
  // standalone permite rodar em Docker; na Vercel a opção é ignorada
  output: "standalone",
  // o loader do @neon/config (jiti) não deve ir para o bundle; é carregado de node_modules no servidor
  serverExternalPackages: ["@neon/config"],
};

export default config;
