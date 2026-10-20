// Carrega .env localmente; no Actions as variáveis já vêm do ambiente.
try {
  process.loadEnvFile();
} catch {
  // sem .env, segue com process.env
}

export function exigir(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida (veja .env.example)`);
  return v;
}
