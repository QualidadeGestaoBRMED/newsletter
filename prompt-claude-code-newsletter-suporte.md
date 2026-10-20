# Projeto: Newsletter de Suporte — Acompanhamento de Prazos

Você vai criar do zero um projeto para a BR MED. Leia este documento inteiro antes de escrever código. Junto dele vai o arquivo `painel-referencia.html`, que é o **design aprovado** do painel (roda sozinho no navegador com dados fictícios). Comece propondo um plano curto e listando as dúvidas; **não invente IDs de campos, e-mails ou nomes** — onde faltar informação, use as constantes marcadas com `TODO` descritas na seção "Pendências".

---

## 1. O que é

Duas vezes por dia útil, um job lê um pipe do Pipefy, calcula o status de prazo de cada demanda de cliente (Segurança, Saúde e On-Going), guarda um **retrato da edição** e envia um e-mail para cada gestor de conta do Suporte com o resumo da carteira dele e um link para o painel.

- **Edição da manhã (07:00):** onde atuar hoje — prazos vencidos, vencendo hoje e nos próximos 2 dias.
- **Edição do fim do dia (18:00, TODO confirmar):** o que foi concluído desde as 07:00, o que vira atraso amanhã e o que segue atrasado.
- **Painel web:** visão gerencial (todas as carteiras) com filtros por gestor, grupo econômico, empresa e área; seletor de edições anteriores ("jornal de ontem"); login obrigatório só para contas `@grupobrmed.com.br`.

## 2. Stack (decidida)

- **Next.js (App Router) + TypeScript**, usado só para login e para servir o painel e a API de leitura das edições.
- **Auth.js v5 (next-auth)** com provedor **Google** (o domínio é Google Workspace).
- **Postgres** via `DATABASE_URL`, com **Drizzle ORM** e migrações versionadas.
- **Job em `jobs/`** (TypeScript executado com `tsx`), no mesmo repositório, compartilhando tipos, mas **independente do Next**.
- **Agendamento: GitHub Actions** (cron).
- **E-mail:** Gmail API (Google Workspace). Template em **react-email** (HTML de tabela, compatível com clientes de e-mail).
- **Testes:** Vitest.
- **Datas:** `date-fns` + `date-fns-tz`, fuso `America/Sao_Paulo` em todo cálculo de "hoje".

Não use Vercel Cron nem rotas agendadas para o job: a paginação do Pipefy pode passar do limite de tempo de funções serverless.

## 3. Estrutura esperada

```
app/
  page.tsx                       # painel (port do painel-referencia.html)
  api/auth/[...nextauth]/route.ts
  api/edicoes/route.ts           # lista de edições (para o seletor)
  api/edicoes/[id]/route.ts      # itens de uma edição
auth.ts
middleware.ts
db/schema.ts · db/index.ts · drizzle/ (migrações)
jobs/
  config.ts      # IDs do pipe, fases excluídas, slugs de campos, horários, TODOs
  pipefy.ts      # cliente GraphQL + paginação
  regras.ts      # cálculo de prazo e status (puro, sem I/O)
  edicao.ts      # monta a edição manhã/tarde e compara com a manhã
  email.ts       # template + envio por gestor
  run.ts         # entrada: `tsx jobs/run.ts manha|tarde [--dry-run] [--data=AAAA-MM-DD]`
  descobrir-campos.ts  # script de descoberta (ver seção 5)
emails/NewsletterGestor.tsx      # template react-email
tests/regras.test.ts · tests/fixtures/
.github/workflows/newsletter.yml
.env.example
```

## 4. Regras de negócio (fonte da verdade)

### 4.1 Fonte
- Pipe **302370343**. Varrer todas as fases **exceto** `315003811` e `322203966`.

### 4.2 Prazo por área (um card pode gerar até 3 itens: um por área que tiver prazo)

Os nomes abaixo são os IDs/slugs dos campos no Pipefy, e as fórmulas vieram de medidas DAX que o time já usa no Power BI.

**Segurança do Trabalho (ST)**
```
prazo_ST = MAX(prazo_de_entrega_p_s_visita, prazo_seguran_a_do_trabalho)
```

**Saúde Ocupacional (SO)**
```
SE (Relatório Anual (Oculto) preenchido) OU (prazo_relat_rio_anual_1 preenchido):
    prazo_saude = prazo_relat_rio_anual_1
SENÃO:
    prazo_saude = MAX(prazo_sa_de_ocupacional, Prazo (SO))
```
`Relatório Anual (Oculto)` e `Prazo (SO)` ainda não têm slug confirmado (TODO). Note que, se só o "Oculto" estiver preenchido, o resultado é o Prazo Relatório Anual mesmo vazio — reproduza esse comportamento e cubra com teste.

**On-Going (OG)**
```
prazo_manut = MAX(prazo_manuten_o_br_net, prazo_manuten_o_br_net_op)
```

`MAX` ignora campos vazios; se todos estiverem vazios, o card não gera item naquela área.

### 4.3 Status (relativo à data da edição, em America/Sao_Paulo)
- `prazo < hoje` → **Atrasado** (guardar `dias_atraso = hoje − prazo`)
- `prazo = hoje` → **Próximo do vencimento**
- `hoje < prazo ≤ hoje + 2 dias` → **No radar**
- `prazo > hoje + 2` → não entra na edição

### 4.4 Demais campos do item
- Empresa: `nome_da_empresa_conforme_br_net`
- Grupo econômico: `grupo_econ_mico_conforme_br_net`
- Gestor da conta (nome e e-mail): **TODO — campo ainda não definido**
- Demanda/documento: TODO (tipo da demanda; pode vir do título do card ou de um campo)
- Também guardar: `card_id`, título, fase atual (id e nome), link do card (`https://app.pipefy.com/open-cards/{card_id}`), qual campo deu o prazo.

### 4.5 Edição do fim do dia
- Não consulta "o que mudou" no Pipefy: compara com o **retrato das 07:00 do mesmo dia**.
- Para cada item da manhã: se o card saiu das fases monitoradas (ou entrou numa das fases excluídas) ou o prazo da área foi removido/estendido para além de D+2 → `Concluído hoje`; senão → `Pendente`.
- Se a edição da manhã não existir (job falhou), a da tarde deve registrar o problema e **não** enviar e-mails; logue e falhe o workflow.

## 5. Pipefy

- GraphQL em `https://api.pipefy.com/graphql`, autenticação `Bearer ${PIPEFY_TOKEN}`.
- Paginar por cursor (`first`/`after`) até o fim, fase a fase (ou pela consulta de todos os cards do pipe, filtrando as fases) — escolha a que for mais eficiente, consultando a documentação atual da API.
- Respeitar limite de requisições: retry com backoff exponencial em 429/5xx.
- **Antes de implementar o mapeamento**, crie `jobs/descobrir-campos.ts`: ele lista as fases do pipe e todos os campos (id, label, tipo) e imprime 3 cards de exemplo com os valores crus. O resultado serve para confirmar slugs e o formato das datas. Faça o parser de datas robusto (`dd/mm/aaaa`, ISO com ou sem hora) e coberto por teste.

## 6. Banco de dados (sugestão — ajuste se fizer sentido)

- `edicoes`: `id`, `data` (date), `periodo` (`manha`|`tarde`), `gerada_em`, `status` (`gerada`|`enviada`|`falhou`), único em (`data`, `periodo`).
- `itens_edicao`: `edicao_id`, `item_id` (`{card_id}-{ST|SO|OG}`), `card_id`, `area`, `demanda`, `empresa`, `grupo`, `gestor_nome`, `gestor_email`, `campo_prazo`, `prazo`, `status`, `dias_atraso`, `fase_id`, `fase_nome`, `link`, `situacao_fim_dia` (nulo na manhã).
- `envios`: `edicao_id`, `destinatario`, `enviado_em`, `message_id` — único em (`edicao_id`, `destinatario`). **Idempotência:** rodar o job duas vezes não pode duplicar edição nem e-mail.
- `gestores` (opcional): `email`, `nome`, `ativo` — mapeamento quando o pipe não trouxer o e-mail.

## 7. Painel (port do `painel-referencia.html`)

O HTML de referência é o design **aprovado**: mantenha layout, cores, fontes, espaçamentos e textos. Ele foi escrito para um runtime chamado `dash`, que o arquivo simula com um shim no `<head>`. No Next, substitua assim:

| No protótipo | No projeto |
|---|---|
| `dash.data('prazos')` | itens da edição selecionada via `GET /api/edicoes/[id]` (as linhas têm os mesmos nomes de colunas do CSV de amostra) |
| `dash.params()` / `setParams` / `resetParams` | estado na URL (`?ed=AAAA-MM-DD-manha&gestor=...&grupo=...&empresa=...&area=...`) |
| `dash.onData(draw)` | renderização após carregar os dados |
| seletor de edições montado a partir das linhas | `GET /api/edicoes` |
| fontes embutidas em base64 | `next/font/google` com **Work Sans** (títulos/números) e **Roboto** (texto) |
| `d3` (rollups, sum, max, interpolateRgb) | pode manter `d3-array`/`d3-interpolate` ou reescrever com utilitários simples |

Pode ser um componente React fiel ao HTML ou, se for mais seguro para a fidelidade visual, um componente cliente que reaproveita o CSS original. Requisitos:
- **Abertura padrão:** se o e-mail logado estiver mapeado para um gestor, abrir já filtrado na carteira dele; e-mails em `GESTAO_EMAILS` (env, lista) abrem na visão de todos.
- **Compatibilidade de links:** `#manha`, `#tarde`, `#gestor=Nome` e `#ed=AAAA-MM-DD-manha|tarde` devem continuar funcionando (os e-mails usarão a forma com query string, mas mantenha o hash por compatibilidade).
- Sem filtro de status na UI (o kanban já separa por status).
- Responsivo como no protótipo.

## 8. Autenticação

- Google Cloud: OAuth client do tipo **Interno** (restrito à organização do Workspace).
- Auth.js com provedor Google. `authorization.params.hd = "grupobrmed.com.br"` só como sugestão na tela de login — **a trava real é no callback**:
  ```ts
  signIn: ({ profile }) =>
    profile?.email_verified === true &&
    profile?.email?.toLowerCase().endsWith("@grupobrmed.com.br") === true,
  authorized: ({ auth }) => !!auth,
  ```
- `middleware.ts` protege tudo exceto `/api/auth/*` e assets.
- As rotas `/api/edicoes*` também conferem a sessão (não confiar só no middleware).

## 9. E-mail

- Um e-mail por gestor com itens na edição. Gestores sem itens: não enviar (TODO confirmar).
- Conteúdo (template react-email, HTML de tabela, sem JavaScript): saudação ("Bom dia, {nome}." / "Boa noite, {nome}."), "Edição da manhã/tarde" com data, os três números com as cores do painel (vencidas `#A05E1E`, hoje `#CC851E`, próximos 2 dias em branco com borda), os 3 primeiros itens da fila (demanda, empresa, dias de atraso ou prazo, link do card) e botão "Abrir painel" com o link já filtrado.
- Edição da tarde: concluídas no dia, viram atraso amanhã, atrasadas em aberto.
- Envio via Gmail API usando conta de serviço com **delegação em todo o domínio**, enviando como `REMETENTE_EMAIL` (TODO — definir a caixa remetente com o admin do Workspace). Deixe a camada de envio atrás de uma interface para trocar por SMTP se necessário.
- Paleta da marca para o template: navy `#193B4F`, teal `#007891`, aqua `#00AFAA`, âmbar `#CC851E`, ferrugem `#A05E1E`, cinzas `#767A7B`, `#DFE0E2`, `#F3F3F3`.

## 10. GitHub Actions

- `.github/workflows/newsletter.yml` com dois agendamentos, só em dias úteis (seg–sex, TODO confirmar feriados):
  - manhã: 07:00 BRT = **10:00 UTC** → agende alguns minutos antes (ex.: `45 9 * * 1-5`), porque o cron do Actions pode atrasar.
  - tarde: 18:00 BRT = **21:00 UTC** (ex.: `45 20 * * 1-5`).
  - O Brasil não tem horário de verão desde 2019; UTC−3 fixo.
- Também `workflow_dispatch` com entradas `periodo`, `data` e `dry_run`.
- Secrets: `PIPEFY_TOKEN`, `DATABASE_URL`, credenciais da conta de serviço Google, `REMETENTE_EMAIL`, `PAINEL_URL`.
- Em falha, o workflow deve falhar visivelmente (e, se possível, notificar um e-mail de alerta — `ALERTA_EMAIL`).
- `concurrency` para impedir duas execuções simultâneas do mesmo período.

## 11. Qualidade

- `jobs/regras.ts` é puro e é o coração do projeto: testes com casos reais (montados a partir do `descobrir-campos.ts`) para cada regra, incluindo campos vazios, só um dos campos preenchido, Relatório Anual, virada de dia em America/Sao_Paulo e D+2.
- Validar os dados do Pipefy com `zod`; card com campo inválido gera log de aviso e é ignorado, não derruba o job.
- `--dry-run` gera a edição e imprime os e-mails sem gravar nem enviar.
- Logs estruturados com totais por área/status e por gestor.

## 12. Pendências (deixar como `TODO` em `jobs/config.ts` ou `.env.example`, nunca inventar)

1. Campo do pipe que identifica o **gestor da conta** (nome e e-mail).
2. Slugs de **Relatório Anual (Oculto)** e **Prazo (SO)**.
3. Campo/fonte do **tipo da demanda/documento**.
4. Horário exato da edição de fim do dia (assumido 18:00).
5. Caixa **remetente** dos e-mails e configuração da conta de serviço com delegação.
6. Lista `GESTAO_EMAILS` (quem abre na visão de todos por padrão).
7. Onde o app Next vai ser hospedado (deixe pronto para Docker e para Vercel).
8. Rodar ou não em feriados.

## 13. Ordem de execução sugerida

1. Esqueleto do repositório, `config.ts`, `.env.example` e `descobrir-campos.ts`.
2. `regras.ts` + testes.
3. `pipefy.ts` + `edicao.ts` + schema do banco; `run.ts manha --dry-run` funcionando.
4. Edição da tarde comparando com a manhã.
5. Painel no Next lendo a API (sem login ainda), fiel ao HTML de referência.
6. Autenticação com trava de domínio.
7. Template e envio de e-mail com idempotência.
8. Workflow do GitHub Actions.

Ao final de cada etapa, pare, mostre o que foi feito e o que falta.
