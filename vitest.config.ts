import { defineConfig } from "vitest/config";

export default defineConfig({
  // o template do e-mail é TSX; o tsconfig.json do Next deixa o JSX em "preserve"
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["tests/**/*.test.ts"], env: { TZ: "UTC" } },
});
