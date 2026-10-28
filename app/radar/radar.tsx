"use client";
// Radar de clientes: o "jornal" (só o que é notícia, na carteira e no tier escolhidos) e a página de cada cliente (?grupo=),
// com o histórico. Os filtros ficam na URL, como no painel de prazos (?gestor=&tier=&grupo=&ver=).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TIERS } from "@/jobs/config";
import { manchete, ordenarSinais, PERIODOS, periodoDe, type Sinal } from "@/lib/radar";

type SinalTela = Sinal & { voto: boolean | null };
type Params = { gestor: string | null; tier: string | null; grupo: string | null; ver: string | null };
const PARAMS = ["gestor", "tier", "grupo", "ver"] as const;
const VISITA = "radar:ultima-visita";

const pl = (c: number, a: string, b: string) => `${c} ${c === 1 ? a : b}`;
const first = (s: string | null) => String(s || "").split(" ")[0];
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmtD = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const quando = (s: Sinal) => fmtD(s.publicado_em ?? s.coletado_em.slice(0, 10));
const fmtVisita = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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
  const p: Params = useMemo(() => Object.fromEntries(PARAMS.map((k) => [k, search.get(k) || null])) as Params, [search]);
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

  // "Novo" = coletado depois da visita anterior; a visita atual fica gravada para a próxima vez
  const [visita, setVisita] = useState<string | null>(null);
  useEffect(() => {
    try {
      setVisita(localStorage.getItem(VISITA));
      localStorage.setItem(VISITA, new Date().toISOString());
    } catch {
      // navegador sem localStorage: sem selo de novo
    }
  }, []);

  const [sinais, setSinais] = useState<SinalTela[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/radar")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setSinais(j.sinais))
      .catch(() => setErro(true));
  }, []);

  const hoje = hojeSP();
  const novo = (s: Sinal) => (visita ? s.coletado_em > visita : periodoDe(s, hoje) === "hoje");

  const todos = sinais ?? [];
  const gestores = Array.from(new Set(todos.map((s) => s.gestor).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const daCarteira = todos.filter((s) => !p.gestor || s.gestor === p.gestor);
  const tiersDisp = TIERS.filter((t) => daCarteira.some((s) => s.tier === t));
  const noTier = daCarteira.filter((s) => !p.tier || s.tier === p.tier);
  const nNovos = noTier.filter(novo).length;
  const nAgir = noTier.filter((s) => s.prioridade === "agir").length;
  const vis = noTier.filter((s) => (p.ver === "novos" ? novo(s) : p.ver === "agir" ? s.prioridade === "agir" : true));

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

  // ---------- peças ----------
  const cabecalho = (s: SinalTela) => (
    <div className="rd-cli">
      {p.grupo ? <span>{s.grupo}</span> : <button type="button" onClick={() => setParams({ grupo: s.grupo, ver: null }, true)}>{s.grupo}</button>}
      {s.tier && <span className="tier">· {s.tier}</span>}
      {novo(s) && <span className="rd-tag new">Novo</span>}
      {s.prioridade === "agir" && <span className="rd-tag hot">Agir agora</span>}
    </div>
  );
  const rodape = (s: SinalTela) => {
    const [f0] = s.fontes;
    const outros = s.fontes.length > 1 ? ` e mais ${s.fontes.length - 1}` : "";
    const vagas = s.tipo === "contratacao" && s.fontes.every((f) => f.url.includes("linkedin.com/jobs"));
    return (
      <div className="rd-meta">
        {s.fontes.length > 1 ? (
          <button
            type="button"
            className="rd-src"
            onClick={(e) => {
              voltar.current = e.currentTarget;
              setModal(s);
            }}
          >
            {vagas ? "Ver as vagas" : "Ver as notícias"} <span className="n">{s.fontes.length}</span>
          </button>
        ) : (
          <a className="rd-src" href={f0.url} target="_blank" rel="noopener noreferrer">
            {vagas ? "Ver as vagas" : "Ler a notícia"} <span aria-hidden="true">↗</span>
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
        <b>Próximo passo:</b> {s.proximo_passo}
      </p>
      {rodape(s)}
    </article>
  );
  const secao = (titulo: string, lista: SinalTela[], quente = false) =>
    lista.length > 0 && (
      <section className="rd-sec" key={titulo}>
        <div className={"rd-sh" + (quente ? " hot" : "")}>
          <h3>{titulo}</h3>
          <span>{pl(lista.length, "sinal", "sinais")}</span>
        </div>
        {lista.map(cartao)}
      </section>
    );

  // ---------- página do cliente ----------
  let corpo: React.ReactNode;
  let capa: React.ReactNode;
  if (p.grupo) {
    const doGrupo = ordenarSinais(
      todos.filter((s) => s.grupo === p.grupo),
      TIERS,
    ) as SinalTela[];
    const ref = doGrupo[0];
    capa = (
      <header className="rd-cover">
        <div>
          <div className="rd-k">
            <button type="button" onClick={() => setParams({ grupo: null }, true)} style={{ font: "inherit", color: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
              ← Radar de clientes
            </button>
            {ref?.tier ? ` · ${ref.tier}` : ""}
          </div>
          <div className="rd-name">{p.grupo}</div>
          <p className="rd-sub">
            {ref?.gestor ? (
              <>
                Carteira de <b>{ref.gestor}</b> ·{" "}
              </>
            ) : null}
            {pl(doGrupo.length, "sinal", "sinais")} nos últimos 90 dias
          </p>
        </div>
        <dl className="rd-facts">
          <div>
            <dt>{doGrupo.filter((s) => s.prioridade === "agir").length}</dt>
            <dd>pedem ação</dd>
          </div>
          <div>
            <dt>{doGrupo.filter(novo).length}</dt>
            <dd>novos desde a última visita</dd>
          </div>
        </dl>
      </header>
    );
    const ctx = doGrupo.filter((s) => s.prioridade === "contexto");
    corpo = !sinais ? (
      <div className="rd-empty">{erro ? "Não foi possível carregar o Radar." : "Carregando…"}</div>
    ) : !doGrupo.length ? (
      <div className="rd-empty">Nenhuma notícia sobre {p.grupo} nos últimos 90 dias.</div>
    ) : (
      <>
        {secao(
          "Agir agora",
          doGrupo.filter((s) => s.prioridade === "agir"),
          true,
        )}
        {secao(
          "Acompanhar",
          doGrupo.filter((s) => s.prioridade === "acompanhar"),
        )}
        {ctx.length > 0 && (
          <details className="rd-ctx">
            <summary>{`Contexto sem ação (${ctx.length})`}</summary>
            {ctx.map(cartao)}
          </details>
        )}
      </>
    );
  } else {
    // ---------- jornal ----------
    const comAcao = vis.filter((s) => s.prioridade !== "contexto");
    const lead = manchete(comAcao, TIERS, hoje) as SinalTela | null;
    const resto = ordenarSinais(
      comAcao.filter((s) => s !== lead),
      TIERS,
    ) as SinalTela[];
    const ctx = vis.filter((s) => s.prioridade === "contexto");
    const nome = first(p.gestor);
    capa = (
      <header className="rd-cover">
        <div>
          <div className="rd-k">Radar de clientes · {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" })}</div>
          <p className="rd-hello">{nome ? `Bom dia, ${nome}.` : "Bom dia."}</p>
          <p className="rd-claim">
            {!sinais
              ? "—"
              : nNovos || nAgir
                ? `${pl(nNovos, "notícia nova", "notícias novas")} desde a última visita e ${pl(nAgir, "sinal pede", "sinais pedem")} ação.`
                : "Nenhuma novidade nos seus clientes."}
          </p>
          <p className="rd-sub">{visita ? `Última visita: ${fmtVisita(visita)}` : "Primeira visita ao Radar"}</p>
        </div>
      </header>
    );
    corpo = !sinais ? (
      <div className="rd-empty">{erro ? "Não foi possível carregar o Radar." : "Carregando…"}</div>
    ) : !lead && !ctx.length ? (
      <div className="rd-empty">Nenhuma notícia com esse filtro. Quando um cliente tiver novidade, ela aparece aqui.</div>
    ) : (
      <>
        {lead && (
          <article className="rd-lead">
            {cabecalho(lead)}
            <h2>{lead.titulo}</h2>
            <p className="rd-ds">{lead.resumo}</p>
            <p className="rd-go">
              <b>Próximo passo:</b> {lead.proximo_passo}
            </p>
            {rodape(lead)}
          </article>
        )}
        {PERIODOS.map(([per, rot]) => secao(rot, resto.filter((s) => periodoDe(s, hoje) === per)))}
        {ctx.length > 0 && (
          <details className="rd-ctx">
            <summary>{`Notas sem ação (${ctx.length})`}</summary>
            {ordenarSinais(ctx, TIERS).map((s) => cartao(s as SinalTela))}
          </details>
        )}
      </>
    );
  }

  return (
    <div className="bm">
      <article className="doc">
        <div className="rd-bar">
          <span className="block" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="BR MED" src="/logo-brmed.png" />
          <nav className="rd-tabs" aria-label="Seções do Briefing">
            <a href={linkPrazos()}>Prazos</a>
            <a href="/radar" aria-current="page" onClick={(e) => (e.preventDefault(), setParams({ grupo: null }, true))}>
              Radar de clientes
            </a>
          </nav>
        </div>

        {capa}

        {!p.grupo && (
          <div className="rd-filters" role="toolbar" aria-label="Filtros do Radar">
            <div className="rd-fg">
              <span className="lb">Carteira</span>
              <select aria-label="Gestor da conta" value={p.gestor && gestores.includes(p.gestor) ? p.gestor : ""} onChange={(e) => setParams({ gestor: e.target.value || null })}>
                <option value="">Toda a base</option>
                {gestores.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="rd-fg">
              <span className="lb">Tier</span>
              <button type="button" className="rd-chip" aria-pressed={!p.tier} onClick={() => setParams({ tier: null })}>
                Todos
              </button>
              {tiersDisp.map((t) => (
                <button key={t} type="button" className="rd-chip" aria-pressed={p.tier === t} onClick={() => setParams({ tier: t })}>
                  {t}
                </button>
              ))}
            </div>
            <div className="rd-fg">
              <span className="lb">Mostrar</span>
              {(
                [
                  [null, "Tudo", noTier.length],
                  ["novos", "Novos", nNovos],
                  ["agir", "Agir agora", nAgir],
                ] as const
              ).map(([k, r, c]) => (
                <button key={r} type="button" className="rd-chip" aria-pressed={p.ver === k} onClick={() => setParams({ ver: k })}>
                  {r}
                  <span className="n">{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rd-sheet">{corpo}</div>

        <footer className="foot">
          <span>Notícias e posts públicos coletados da web e do LinkedIn e triados por IA. Marque 👍/👎 para calibrar o Radar.</span>
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
