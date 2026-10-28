// Avisa por e-mail que o job falhou. Chamado pelo workflow do Actions só em caso de falha.
// Uso: tsx jobs/alerta.ts "<assunto>" "<link da execução>"
import "./env";
import { destinosAlerta, MandrillRemetente } from "./email";

async function main() {
  const destinos = destinosAlerta();
  if (!destinos.length) return console.log("ALERTA_EMAIL não definido: alerta não enviado");
  const [motivo = "Job falhou", link = ""] = process.argv.slice(2);
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const assunto = `${motivo} (${quando})`;
  const texto = `${assunto}\n\nVeja o log da execução: ${link}`;
  const remetente = new MandrillRemetente();
  for (const para of destinos) {
    const r = await remetente.enviar({
      para: { email: para },
      assunto: `[Briefing Suporte] ${assunto}`,
      html: `<p>${assunto}</p><p><a href="${link}">Abrir o log da execução no GitHub Actions</a></p>`,
      texto,
      tags: ["newsletter-suporte", "alerta"],
    });
    console.log(`Alerta enviado para ${para} (Mandrill ${r.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
