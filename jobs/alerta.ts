// Avisa por e-mail que o job falhou. Chamado pelo workflow do Actions só em caso de falha.
// Uso: tsx jobs/alerta.ts "<assunto>" "<link da execução>"
import "./env";
import { MandrillRemetente } from "./email";

async function main() {
  const para = process.env.ALERTA_EMAIL?.trim();
  if (!para) return console.log("ALERTA_EMAIL não definido: alerta não enviado");
  const [assunto = "Job falhou", link = ""] = process.argv.slice(2);
  const texto = `${assunto}\n\nVeja o log da execução: ${link}`;
  const r = await new MandrillRemetente().enviar({
    para: { email: para },
    assunto: `[Briefing Suporte] ${assunto}`,
    html: `<p>${assunto}</p><p><a href="${link}">Abrir o log da execução no GitHub Actions</a></p>`,
    texto,
    tags: ["newsletter-suporte", "alerta"],
  });
  console.log(`Alerta enviado para ${para} (Mandrill ${r.id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
