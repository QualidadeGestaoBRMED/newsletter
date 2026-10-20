import type { NextConfig } from "next";

// standalone permite rodar em Docker; na Vercel a opção é ignorada
const config: NextConfig = { output: "standalone" };

export default config;
