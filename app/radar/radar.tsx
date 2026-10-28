"use client";
// Radar de clientes. Como os prazos, tem edições: a edição é o que a coleta do dia trouxe (?ed=AAAA-MM-DD; sem ?ed, a mais recente).
// A página de cada cliente (?grupo=) mostra o histórico dele. Mesma capa, filtros e "Comece por aqui" do painel de prazos;
// os filtros ficam na URL (?gestor=&tier=&grupo=&ed=).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TIERS } from "@/jobs/config";
import { manchete, ordenarSinais, type Sinal } from "@/lib/radar";
import { ponto } from "./ponto";
import SeletorCliente, { type OpcaoCliente } from "./seletor-cliente";

type SinalTela = Sinal & { voto: boolean | null };
type Params = { gestor: string | null; tier: string | null; grupo: string | null; ed: string | null };
const PARAMS = ["gestor", "tier", "grupo", "ed"] as const;
const ED = /^\d{4}-\d{2}-\d{2}$/;

// as mesmas cores do painel: pede ação = vencido, acompanhar = vence hoje; a terceira bolha usa o verde-água da marca
const COR = { agir: "#cc0000", acompanhar: "#cc851e", terceira: "#00AFAA" };
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const pl = (c: number, a: string, b: string) => `${c} ${c === 1 ? a : b}`;
const dd = (x: number) => (x >= 0 && x < 10 ? "0" + x : String(x));
const first = (s: string | null) => String(s || "").split(" ")[0];
const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const day = (s: string) => new Date(`${s}T12:00:00`);
const fmtD = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const quando = (s: Sinal) => fmtD(s.publicado_em ?? s.coletado_em.slice(0, 10));
const edicaoDe = (s: Sinal) => diaSP(new Date(s.coletado_em));

const UP = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);
const DOWN = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </svg>
);

export default function Radar({ gestorInicial }: { gestorInicial: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const p: Params = useMemo(() => {
    const o = Object.fromEntries(PARAMS.map((k) => [k, search.get(k) || null])) as Params;
    if (o.ed && !ED.test(o.ed)) o.ed = null;
    return o;
  }, [search]);
  const setParams = (up: Partial<Params>, navegar = false) => {
    const s = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(up)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    const qs = s.toString();
    router[navegar ? "push" : "replace"](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    if (navegar) window.scrollTo({ top: 0 });
  };

  // o gestor que entrou abre na própria carteira (só na abertura, e só se o link não traz recorte)
  useEffect(() => {
    if (gestorInicial && !p.gestor && !p.grupo) setParams({ gestor: gestorInicial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sinais, setSinais] = useState<SinalTela[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/radar")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setSinais(j.sinais))
      .catch(() => setErro(true));
  }, []);

  const docRef = useRef<HTMLElement>(null);
  const [largura, setLargura] = useState(1000);
  useLayoutEffect(() => {
    const medir = () => setLargura(docRef.current?.clientWidth || 1000);
    medir();
    addEventListener("resize", medir);
    return () => removeEventListener("resize", medir);
  }, []);

  const todos = sinais ?? [];

  // ---------- edições: um dia de coleta = uma edição ----------
  const edicoes = useMemo(() => Array.from(new Set(todos.map(edicaoDe))).sort().reverse(), [todos]);
  const atual = edicoes[0] ?? diaSP(new Date());
  const ed = p.ed && edicoes.includes(p.ed) ? p.ed : atual;
  const passado = ed !== atual;
  const dEd = day(ed);

  // ---------- recortes ----------
  const gestores = Array.from(new Set(todos.map((s) => s.gestor).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const daCarteira = todos.filter((s) => !p.gestor || s.gestor === p.gestor);
  const tiersDisp = TIERS.filter((t) => daCarteira.some((s) => s.tier === t));
  const noTier = daCarteira.filter((s) => !p.tier || s.tier === p.tier);
  const doGrupo = p.grupo ? (ordenarSinais(todos.filter((s) => s.grupo === p.grupo), TIERS) as SinalTela[]) : [];
  const daEdicao = noTier.filter((s) => edicaoDe(s) === ed);
  const vis = p.grupo ? doGrupo : (ordenarSinais(daEdicao, TIERS) as SinalTela[]);
  const agir = vis.filter((s) => s.prioridade === "agir");
  const acomp = vis.filter((s) => s.prioridade === "acompanhar");
  const ctx = vis.filter((s) => s.prioridade === "contexto");
  const lead = manchete([...agir, ...acomp], TIERS, ed) as SinalTela | null;
  const refGrupo = doGrupo[0];
  const nClientes = new Set(vis.map((s) => s.grupo)).size;
  const coletaHora = daEdicao.length ? horaSP(daEdicao.map((s) => s.coletado_em).sort()[0]) : null;

  // seletor de cliente: quem teve notícia no recorte (carteira e tier), com a contagem; o cliente aberto entra mesmo fora dele
  const porCliente = new Map<string, OpcaoCliente>();
  for (const s of noTier) {
    const c = porCliente.get(s.grupo) ?? { nome: s.grupo, tier: s.tier, n: 0 };
    c.n++;
    porCliente.set(s.grupo, c);
  }
  if (p.grupo && !porCliente.has(p.grupo)) porCliente.set(p.grupo, { nome: p.grupo, tier: refGrupo?.tier ?? null, n: doGrupo.length });
  const clientesSel = [...porCliente.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // ---------- votos ----------
  const votar = (s: SinalTela, util: boolean) => {
    const novoVoto = s.voto === util ? null : util;
    setSinais((v) => v && v.map((x) => (x.id === s.id ? { ...x, voto: novoVoto } : x)));
    fetch("/api/radar/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinal_id: s.id, util: novoVoto }) }).catch(
      () => setSinais((v) => v && v.map((x) => (x.id === s.id ? { ...x, voto: s.voto } : x))),
    );
  };

  // ---------- modal de fontes ----------
  const [modal, setModal] = useState<SinalTela | null>(null);
  const voltar = useRef<HTMLElement | null>(null);
  const abrirFontes = (s: SinalTela, el: HTMLElement) => {
    voltar.current = el;
    setModal(s);
  };
  const fechar = () => {
    setModal(null);
    voltar.current?.focus();
  };
  useEffect(() => {
    if (!modal) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [modal]);

  const linkPrazos = () => {
    const s = new URLSearchParams();
    if (p.gestor) s.set("gestor", p.gestor);
    if (p.grupo) s.set("grupo", p.grupo);
    if (p.tier) s.set("tier", p.tier);
    const qs = s.toString();
    return qs ? `/?${qs}` : "/";
  };

  // ---------- capa (a mesma do painel de prazos) ----------
  const nome = first(p.gestor);
  const seus = p.gestor ? "dos seus clientes" : "dos clientes";
  const hello: ReactNode = p.grupo ? (
    refGrupo?.tier ? (
      <>
        Cliente {ponto(refGrupo.tier)}
        {refGrupo.tier}.
      </>
    ) : (
      "Cliente."
    )
  ) : passado ? (
    nome ? `${nome},` : "Edição anterior."
  ) : nome ? (
    `Bom dia, ${nome}.`
  ) : (
    "Bom dia."
  );
  const claim = !sinais
    ? erro
      ? "Não foi possível carregar o Radar."
      : "—"
    : p.grupo
      ? doGrupo.length
        ? `${pl(doGrupo.length, "notícia", "notícias")} nos últimos 90 dias${agir.length ? `, ${agir.length} ${agir.length === 1 ? "pede" : "pedem"} ação` : ""}.`
        : "Sem notícias nos últimos 90 dias."
      : vis.length
        ? `${pl(vis.length, "notícia", "notícias")} ${seus} ${passado ? "nesta edição" : "hoje"}${agir.length ? `, ${agir.length} ${agir.length === 1 ? "pede" : "pedem"} ação` : ""}.`
        : `Nenhuma notícia ${seus} ${passado ? "nesta edição" : "hoje"}.`;
  const numeros: [number, string, string][] = [
    [agir.length, "pedem ação", COR.agir],
    [acomp.length, "para acompanhar", COR.acompanhar],
    p.grupo ? [doGrupo.length, "notícias em 90 dias", COR.terceira] : [nClientes, nClientes === 1 ? "cliente com notícia" : "clientes com notícia", COR.terceira],
  ];

  // ---------- peças ----------
  const cabecalho = (s: SinalTela) => (
    <div className="rd-cli">
      {p.grupo ? (
        <span>{s.grupo}</span>
      ) : (
        <button type="button" onClick={() => setParams({ grupo: s.grupo }, true)}>
          {s.grupo}
        </button>
      )}
      {s.tier && (
        <span className="tier">
          · {ponto(s.tier)}
          {s.tier}
        </span>
      )}
    </div>
  );
  const ehVagas = (s: SinalTela) => s.tipo === "contratacao" && s.fontes.every((f) => f.url.includes("linkedin.com/jobs"));
  const rodape = (s: SinalTela) => {
    const [f0] = s.fontes;
    const outros = s.fontes.length > 1 ? ` e mais ${s.fontes.length - 1}` : "";
    return (
      <div className="rd-meta">
        {s.fontes.length > 1 ? (
          <button type="button" className="rd-src" onClick={(e) => abrirFontes(s, e.currentTarget)}>
            {ehVagas(s) ? "Ver as vagas" : "Ver as notícias"} <span className="n">{s.fontes.length}</span>
          </button>
        ) : (
          <a className="rd-src" href={f0.url} target="_blank" rel="noopener noreferrer">
            {ehVagas(s) ? "Ver as vagas" : "Ler a notícia"} <span aria-hidden="true">↗</span>
          </a>
        )}
        <span>{`${f0.veiculo}${outros} · ${quando(s)}`}</span>
        <div className="rd-fb">
          <button type="button" aria-label="Útil" title="Útil" aria-pressed={s.voto === true} className={s.voto === true ? "sel" : undefined} onClick={() => votar(s, true)}>
            {UP}
          </button>
          <button type="button" aria-label="Não útil" title="Não útil" aria-pressed={s.voto === false} className={s.voto === false ? "sel" : undefined} onClick={() => votar(s, false)}>
            {DOWN}
          </button>
        </div>
      </div>
    );
  };
  const cartao = (s: SinalTela) => (
    <article key={s.id} className="rd-sig">
      {cabecalho(s)}
      <h4>{s.titulo}</h4>
      <p className="rd-ds">{s.resumo}</p>
      <p className="rd-go">
        <span className="lb">Próximo passo</span>
        {s.proximo_passo.charAt(0).toUpperCase() + s.proximo_passo.slice(1)}
      </p>
      {rodape(s)}
    </article>
  );
  const bloco = (titulo: string, lista: SinalTela[], quente = false) =>
    lista.length > 0 && (
      <div className="rd-sec" key={titulo}>
        <div className={"rd-sh" + (quente ? " hot" : "")}>
          <h3>{titulo}</h3>
          <span>{pl(lista.length, "notícia", "notícias")}</span>
        </div>
        {lista.map(cartao)}
      </div>
    );

  let lista: ReactNode;
  if (!sinais) lista = <div className="rd-empty">{erro ? "Não foi possível carregar o Radar." : "Carregando…"}</div>;
  else if (!vis.length)
    lista = (
      <div className="rd-empty">
        {p.grupo ? `Nenhuma notícia sobre ${p.grupo} nos últimos 90 dias.` : `Nenhuma notícia ${seus} nesta edição. Quando um cliente tiver novidade, ela aparece aqui.`}
      </div>
    );
  else
    lista = (
      <>
        {bloco("Pedem ação", agir, true)}
        {bloco("Para acompanhar", acomp)}
      </>
    );

  // bolhas menores em tela estreita, como no painel
  const k = largura < 760 ? 0.8 : 1;
  return (
    <div className="bm">
      <article className="doc" ref={docRef}>
        <header className="cover" id="topo">
          <div className="cover-teal">
            <span className="block" aria-hidden="true" />
            <span className="c-dot-a" aria-hidden="true" />
            <div className="cover-brand">
              <div className="logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="BR MED" src="/logo-brmed.png" />
              </div>
              <div className="cover-right">
                <nav className="cover-client" aria-label="Seções do Briefing">
                  <b>BRIEFING</b>
                  <i aria-hidden="true">·</i>
                  <a className="sec" href={linkPrazos()}>
                    <span className="sec-l">PRAZOS DO CLIENTE</span>
                    <span className="sec-c">PRAZOS</span>
                  </a>
                  <i aria-hidden="true">·</i>
                  {/* na página do cliente, a seção atual volta para o jornal */}
                  <a
                    className="sec on"
                    href="/radar"
                    aria-current="page"
                    onClick={(e) => {
                      e.preventDefault();
                      if (p.grupo) setParams({ grupo: null }, true);
                    }}
                  >
                    <span className="sec-l">RADAR DE CLIENTES</span>
                    <span className="sec-c">RADAR</span>
                  </a>
                </nav>
                {!p.grupo && edicoes.length > 0 && (
                  <select className="ed-sel" aria-label="Edição" value={ed} onChange={(e) => setParams({ ed: e.target.value === atual ? null : e.target.value })}>
                    {edicoes.map((x) => (
                      <option key={x} value={x}>
                        {`${x === atual ? "Atual: " : ""}${DIA[day(x).getDay()].slice(0, 3)} ${fmtD(x)}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="bubbles" role="img" aria-label={sinais ? numeros.map((x) => `${x[0]} ${x[1]}`).join(", ") : undefined}>
              {sinais &&
                [48, 39, 31].map((r0, i) => {
                  const [v, l, c] = numeros[i];
                  const r = r0 * k;
                  return (
                    <div
                      key={i}
                      className={"bub" + (!v ? " zero" : "")}
                      style={{ width: 2 * r, height: 2 * r, background: c, zIndex: 3 - i, fontSize: Math.round(r * 0.72 * Math.min(1, 3.2 / String(v).length)) }}
                      title={`${v} ${l}`}
                    >
                      {dd(v)}
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="cover-navy">
            <h1 className="mast">
              <span className="mast-k">{p.grupo ? "Radar do cliente" : "Radar de"}</span>
              <span className={"mast-w" + (p.grupo ? " rd-mast-grupo" : "")}>{p.grupo ? p.grupo.toLowerCase() : "clientes"}</span>
              {/* "anterior" fica na linha da data: no rótulo de cima ele bate nas letras altas de "clientes" */}
              <span className="mast-d">
                {p.grupo ? "últimos 90 dias" : `${passado ? "Edição anterior · " : ""}${DIA[dEd.getDay()]}, ${dEd.getDate()} de ${MES[dEd.getMonth()]}`}
              </span>
            </h1>
            <div className="say">
              <p className="hello">{hello}</p>
              <p className="claim">{claim}</p>
              <div className="lead-c">
                {sinais && (
                  <ul className="legend" style={{ "--nw": "2.2ch" } as CSSProperties}>
                    {numeros.map(([v, txt, c]) => (
                      <li key={txt}>
                        <i style={{ background: c }} />
                        <b>{dd(v)}</b>
                        <span>{txt}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="note">
                  {p.grupo ? (refGrupo?.gestor ? `Carteira de ${refGrupo.gestor}.` : "") : coletaHora ? `Coleta das ${coletaHora}.` : ""}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="filters" id="filtros">
          <span className="kicker">Filtrar</span>
          {!p.grupo && (
            <select aria-label="Gestor da conta" value={p.gestor && gestores.includes(p.gestor) ? p.gestor : ""} onChange={(e) => setParams({ gestor: e.target.value || null })}>
              <option value="">Todos os gestores</option>
              {gestores.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
          {/* atalho para a página do cliente; na página dele, troca de cliente */}
          <SeletorCliente clientes={clientesSel} valor={p.grupo} onEscolher={(g) => setParams({ grupo: g }, true)} />
          {!p.grupo && (
            // botões em vez de select: a opção do select não mostra a cor do tier
            <span className="rd-tiers" role="group" aria-label="Tier do cliente">
              <button type="button" aria-pressed={!p.tier} onClick={() => setParams({ tier: null })}>
                Todos os tiers
              </button>
              {tiersDisp.map((t) => (
                <button key={t} type="button" aria-pressed={p.tier === t} onClick={() => setParams({ tier: p.tier === t ? null : t })}>
                  {ponto(t)}
                  {t}
                </button>
              ))}
            </span>
          )}
          <button type="button" className="reset" onClick={() => setParams({ gestor: null, tier: null, grupo: null }, !!p.grupo)}>
            Limpar
          </button>
        </div>

        <div className="sheet">
          <div className="next" id="comece">
            <span className="lb">Comece por aqui</span>
            <p>
              {lead ? (
                <>
                  <b>{`${lead.titulo}.`}</b> {`${lead.proximo_passo.charAt(0).toUpperCase()}${lead.proximo_passo.slice(1)}`}
                </>
              ) : sinais ? (
                `Nenhuma notícia que peça ação ${p.grupo ? "deste cliente" : "nesta edição"}.`
              ) : (
                "—"
              )}
            </p>
            {lead && (
              <a
                href={lead.fontes.length > 1 ? "#" : lead.fontes[0].url}
                target={lead.fontes.length > 1 ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (lead.fontes.length > 1) {
                    e.preventDefault();
                    abrirFontes(lead, e.currentTarget);
                  }
                }}
              >
                {lead.fontes.length > 1 ? `Ver as ${lead.fontes.length} fontes` : "Ler a notícia"}
              </a>
            )}
          </div>

          <section id="noticias" style={{ marginTop: 52 }}>
            <div className="sec-h">
              <div>
                <span className="kicker">{p.grupo ? "Histórico" : "Notícias da edição"}</span>
                <h2>
                  {p.grupo ? (
                    <>
                      O que aconteceu com <b>{p.grupo}</b>
                    </>
                  ) : (
                    <>
                      O que <b>mudou nos seus clientes</b>
                    </>
                  )}
                </h2>
                <p>
                  {p.grupo
                    ? "Tudo o que o Radar encontrou sobre o cliente nos últimos 90 dias, do que pede ação ao que é só para acompanhar."
                    : "Só aparece aqui o cliente que teve notícia. Clique no nome do cliente para ver o histórico dele."}
                </p>
              </div>
            </div>
            {lista}
            {ctx.length > 0 && (
              <details className="rd-ctx">
                <summary>{`${p.grupo ? "Contexto" : "Notas"} sem ação (${ctx.length})`}</summary>
                {ctx.map(cartao)}
              </details>
            )}
          </section>
        </div>

        <footer className="foot">
          <span>Radar gerado automaticamente a partir de notícias e posts públicos dos clientes.</span>
          <span className="pg">BR MED · Suporte</span>
        </footer>
      </article>

      <div className={"rd-ov" + (modal ? " on" : "")} aria-hidden={!modal} onClick={(e) => e.target === e.currentTarget && fechar()}>
        {modal && (
          <div className="rd-modal" role="dialog" aria-modal="true" aria-labelledby="rd-mt">
            <div className="rd-mh">
              <div>
                <div className="kk">{`${modal.grupo} · ${modal.fontes.length} fontes`}</div>
                <h3 id="rd-mt">{modal.titulo}</h3>
              </div>
              <button type="button" className="rd-x" aria-label="Fechar" onClick={fechar} autoFocus>
                ×
              </button>
            </div>
            <ul className="rd-list">
              {modal.fontes.map((f, i) => (
                <li key={f.url} style={{ animationDelay: `${60 + i * 45}ms` }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <span className="t">{f.titulo}</span>
                    <span className="o">{`${f.veiculo}${f.data ? ` · ${fmtD(f.data)}` : ""}`}</span>
                    <span className="ar">↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="rd-mf">O Radar juntou essas publicações porque falam do mesmo fato.</div>
          </div>
        )}
      </div>
    </div>
  );
}
