"use client";
// Port do painel-referencia.html. Os params do `dash` viram query string (?ed=&gestor=&grupo=&empresa=&area=)
// e os dados vêm de /api/edicoes. Textos, classes e regras de desenho seguem o protótipo.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TIERS } from "@/jobs/config";
import Evolucao from "./evolucao";
import { ID_EDICAO, type EdicaoResumo, type Linha, type Periodo } from "@/lib/painel";

type Row = Linha & { done: boolean; off: number };
type Params = { ed: string | null; gestor: string | null; grupo: string | null; empresa: string | null; area: string | null; tier: string | null };
type Carga = { id: string; status: "loading" | "ok" | "error"; linhas: Linha[] };

const ORD: Record<string, number> = { Atrasado: 0, "Próximo do vencimento": 1, "No radar (até D+2)": 2 };
const SIG: Record<string, string> = { Segurança: "ST", Saúde: "SO", "On-Going": "OG" };
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const n = (x: number) => new Intl.NumberFormat("pt-BR").format(x);
const dd = (x: number) => (x >= 0 && x < 10 ? "0" + x : n(x)); // 5 → 05, para os números ficarem alinhados
const pl = (c: number, a: string, b: string) => (c === 1 ? a : b);
const first = (s: string | null) => String(s || "").split(" ")[0];
const day = (s: string) => new Date(String(s).slice(0, 10) + "T12:00:00");
const fmtD = (s: string) => {
  const d = day(s);
  return isNaN(+d) ? "—" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const uniq = (a: string[]) => Array.from(new Set(a)).sort((x, y) => x.localeCompare(y, "pt-BR"));
const safe = (u: string) => (/^https:\/\/app\.pipefy\.com\//.test(String(u || "")) ? String(u) : null);
const urg = (a: Row, b: Row) => ORD[a.status] - ORD[b.status] || b.dias_atraso - a.dias_atraso || String(a.prazo).localeCompare(String(b.prazo));

function agrupar<T>(v: T[], chave: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of v) {
    const k = chave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return [...m];
}

// Cores de status, da escala de severidade: Catastrófico, Alto, Moderado, Baixo e Leve
const COR = { vencido: "#cc0000", hoje: "#cc851e", radar: "#d9be53", resolvido: "#2cad6e", noPrazo: "#aad1b4" };
// mapa de calor: de um tom claro do vencido até o vencido, pela parte atrasada (como d3.interpolateRgb)
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const [R0, R1] = [rgb("#F7D9D9"), rgb(COR.vencido)];
const ramp = (t: number) => `rgb(${R0.map((a, i) => Math.round(a + (R1[i] - a) * t)).join(", ")})`;

const PARAMS = ["ed", "gestor", "grupo", "empresa", "area", "tier"] as const;
// tiers na ordem da régua; valores fora dela (esquema antigo) e "Sem tier" vão para o fim
// cor do pontinho de cada tier; longe do âmbar e do ferrugem, que no painel são status
const COR_TIER: Record<string, string> = {
  Diamante: "#2EC4E6",
  Ouro: "#E3B341",
  Prata: "#AEB6BC",
  Bronze: "#B9825A",
  "Bronze(-)": "#D9B79A",
  RG: "#7E8C96",
  "Parceiros / Cortesia": "#C9A9D6",
};
const ordemTier = (t: string) => (TIERS.includes(t) ? TIERS.indexOf(t) : t === "Sem tier" ? TIERS.length + 1 : TIERS.length);

export default function Painel({ gestorInicial }: { gestorInicial: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const p: Params = useMemo(() => {
    const o = Object.fromEntries(PARAMS.map((k) => [k, search.get(k) || null])) as Params;
    if (o.ed && !ID_EDICAO.test(o.ed)) o.ed = null;
    return o;
  }, [search]);

  // `navegar` grava no histórico, para o botão voltar do navegador desfazer a descida na visão gerencial
  const setParams = (up: Partial<Params>, navegar = false) => {
    const s = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(up)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    const qs = s.toString();
    router[navegar ? "push" : "replace"](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Links antigos: #manha / #tarde abrem a edição mais recente daquele horário; #gestor=Nome e #ed=AAAA-MM-DD-manha|tarde filtram
  const [pref, setPref] = useState<Periodo | null>(null);
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    const up: Partial<Params> = {};
    if (h) {
      h.split("&").forEach((kv) => {
        const [k, v] = kv.split("=");
        if (k === "manha" || k === "tarde") setPref(k);
        if (k === "ed" && ID_EDICAO.test(v || "")) up.ed = v;
        if (k === "gestor" && v) up.gestor = v;
      });
      history.replaceState(null, "", location.pathname + location.search);
    }
    // sem recorte de carteira no link, o gestor que entrou abre na própria carteira (só na abertura)
    if (gestorInicial && !up.gestor && !p.gestor && !p.grupo && !p.empresa) up.gestor = gestorInicial;
    if (Object.keys(up).length) setParams(up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [edicoes, setEdicoes] = useState<EdicaoResumo[] | null>(null);
  const [erroLista, setErroLista] = useState(false);
  useEffect(() => {
    fetch("/api/edicoes")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setEdicoes(j.edicoes))
      .catch(() => setErroLista(true));
  }, []);

  // edições: toda data tem a das 07:00; a das 18:00 só existe depois do fechamento
  const padrao = useMemo(() => {
    if (!edicoes?.length) return null;
    return (pref && edicoes.find((e) => e.periodo === pref)) || edicoes[0];
  }, [edicoes, pref]);
  const sel = (p.ed && edicoes?.find((e) => e.id === p.ed)) || padrao;
  const tarde = sel?.periodo === "tarde";
  const passado = !!sel && sel.id !== padrao?.id;
  const hoje = sel ? day(sel.data) : null;

  const cache = useRef(new Map<string, Linha[]>());
  const [carga, setCarga] = useState<Carga | null>(null);
  useEffect(() => {
    if (!sel) return;
    const id = sel.id;
    const pronto = cache.current.get(id);
    if (pronto) return setCarga({ id, status: "ok", linhas: pronto });
    setCarga((c) => ({ id, status: "loading", linhas: c?.linhas ?? [] }));
    let vivo = true;
    fetch(`/api/edicoes/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        cache.current.set(id, j.linhas);
        if (vivo) setCarga({ id, status: "ok", linhas: j.linhas });
      })
      .catch(() => vivo && setCarga({ id, status: "error", linhas: [] }));
    return () => {
      vivo = false;
    };
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = !!sel && carga?.id === sel.id && carga.status === "ok";
  const atualizando = carga?.status === "loading";

  const [q, setQ] = useState("");
  const [evo, setEvo] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const docRef = useRef<HTMLElement>(null);
  const [largura, setLargura] = useState(1000);
  useLayoutEffect(() => {
    const medir = () => setLargura(docRef.current?.clientWidth || 1000);
    medir();
    addEventListener("resize", medir);
    return () => removeEventListener("resize", medir);
  }, []);

  const all: Row[] = useMemo(
    () =>
      ok && hoje
        ? carga!.linhas.map((r) => ({ ...r, done: r.situacao_fim_dia === "Concluído hoje", off: Math.round((+day(r.prazo) - +hoje) / 864e5) }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ok, carga, sel?.id],
  );

  const gestores = uniq(all.map((r) => r.gestor));
  const aG = all.filter((r) => !p.gestor || r.gestor === p.gestor);
  const grupos = uniq(aG.map((r) => r.grupo));
  const aGr = aG.filter((r) => !p.grupo || r.grupo === p.grupo);
  const empresas = uniq(aGr.map((r) => r.empresa));
  const areasDisp = Object.keys(SIG).filter((a) => all.some((r) => r.area === a));
  const tiersDisp = uniq(all.map((r) => r.tier)).sort((a, b) => ordemTier(a) - ordemTier(b));
  const ql = q.toLowerCase();
  const f = aGr.filter(
    (r) =>
      (!p.empresa || r.empresa === p.empresa) &&
      (!p.area || r.area === p.area) &&
      (!p.tier || r.tier === p.tier) &&
      (!ql || [r.card, r.demanda, r.empresa, r.grupo, r.gestor, r.tier, r.fase, r.card_id].join(" ").toLowerCase().includes(ql)),
  );

  const atr = f.filter((r) => r.status === "Atrasado"),
    hj = f.filter((r) => r.status === "Próximo do vencimento"),
    rad = f.filter((r) => r.status === "No radar (até D+2)");
  const conc = f.filter((r) => r.done),
    atrP = atr.filter((r) => !r.done),
    hjP = hj.filter((r) => !r.done);
  const nome = p.gestor ? first(p.gestor) : null;

  // ---------- capa ----------
  const hello = tarde ? `Boa noite, ${nome || "time"}.` : `Bom dia, ${nome || "time"}.`;
  let claim: string = "—";
  let lead: ReactNode = null;
  const legend = (rows: [number, string, string][], note: string) => (
    <>
      {/* a coluna do número cresce com o maior valor (o protótipo previa até 2 dígitos) */}
      <ul className="legend" style={{ "--nw": `${Math.max(2.2, ...rows.map(([v]) => dd(v).length + 0.2))}ch` } as CSSProperties}>
        {rows.map(([v, txt, c]) => (
          <li key={txt}>
            <i style={{ background: c }} />
            <b>{dd(v)}</b>
            <span>{txt}</span>
          </li>
        ))}
      </ul>
      {note && <p className="note">{note}</p>}
    </>
  );
  if (!ok) {
    if (erroLista || carga?.status === "error") lead = "Não foi possível carregar a edição.";
    else if (edicoes && !edicoes.length) lead = "Nenhuma edição gerada ainda.";
  } else if (!f.length) {
    claim = "Nada pendente neste recorte.";
    lead = "Nenhum prazo vencido, vencendo no dia ou nos dois dias seguintes.";
  } else if (!tarde) {
    const acao = atr.length + hj.length;
    claim = `${n(acao)} ${pl(acao, passado ? "demanda pedia" : "demanda pede", passado ? "demandas pediam" : "demandas pedem")} ação ${passado ? "neste dia" : "hoje"}.`;
    const crit = agrupar(atr.filter((r) => r.empresa), (r) => r.empresa).sort((a, b) => b[1].length - a[1].length)[0];
    lead = legend(
      [
        [atr.length, "com prazo vencido", COR.vencido],
        [hj.length, pl(hj.length, "vence hoje", "vencem hoje"), COR.hoje],
        [rad.length, "nos próximos 2 dias", COR.radar],
      ],
      crit && crit[1].length > 1 ? `${crit[0]} concentra ${n(crit[1].length)} dos atrasos.` : "",
    );
  } else {
    claim = `${n(conc.length)} de ${n(f.length)} ${pl(f.length, "demanda resolvida", "demandas resolvidas")} no dia.`;
    lead = legend(
      [
        [atrP.length, pl(atrP.length, "atrasada em aberto", "atrasadas em aberto"), COR.vencido],
        [hjP.length, pl(hjP.length, "vira atraso amanhã", "viram atraso amanhã"), COR.hoje],
        [conc.length, pl(conc.length, "resolvida no dia", "resolvidas no dia"), COR.resolvido],
      ],
      "",
    );
  }

  // os círculos da marca viram os números do dia: tamanho pela prioridade, número pela contagem
  const bolhas: [number, string, string][] = tarde
    ? [
        [atrP.length, "atrasadas em aberto", COR.vencido],
        [hjP.length, "viram atraso amanhã", COR.hoje],
        [conc.length, "resolvidas no dia", COR.resolvido],
      ]
    : [
        [atr.length, "prazo vencido", COR.vencido],
        [hj.length, "vence hoje", COR.hoje],
        [rad.length, "próximos 2 dias", COR.radar],
      ];
  const k = largura < 760 ? 0.8 : 1;

  // ---------- comece por aqui ----------
  const top = (tarde ? [...hjP, ...atrP] : f).slice().sort(urg)[0];
  const topLink = top ? safe(top.link) : null;

  // ---------- onde atuar ----------
  const cols: [string, string, string, string, Row[], boolean][] = tarde
    ? [
        ["hoje", COR.hoje, "Viram atraso amanhã", "venciam no dia", hjP, false],
        ["atr", COR.vencido, "Atrasadas em aberto", "sem conclusão às 18:00", atrP, false],
        ["done", COR.resolvido, "Concluídas no dia", "desde as 07:00", conc, true],
      ]
    : [
        ["atr", COR.vencido, "Prazo vencido", "mais antigas primeiro", atr, false],
        ["hoje", COR.hoje, "Vence hoje", "resolver até o fim do dia", hj, false],
        ["rad", COR.radar, "Próximos 2 dias", "para antecipar", rad, true],
      ];

  // ---------- carteiras ----------
  const lvl = !p.gestor ? "gestor" : !p.grupo ? "grupo" : "empresa";
  const areasMx = Object.keys(SIG).filter((a) => !p.area || a === p.area);
  const atrasadas = (v: Row[]) => v.filter((r) => r.status === "Atrasado").length;
  const linhasMx = agrupar(f, (r) => r[lvl]).sort((a, b) => atrasadas(b[1]) - atrasadas(a[1]) || b[1].length - a[1].length);
  const cell = (v: Row[], tot: boolean, key: string) => {
    const rotulo = tot ? "Total" : SIG[key];
    if (!v.length)
      return (
        <td key={key} className="z" data-l={rotulo}>
          0
        </td>
      );
    const a = atrasadas(v),
      s = a / v.length;
    const style: CSSProperties = {
      background: a ? ramp(0.2 + 0.8 * s) : v.some((r) => r.status === "Próximo do vencimento") ? "#F7EAD4" : COR.noPrazo,
      color: a && s > 0.5 ? "#fff" : "#193B4F",
    };
    return (
      <td key={key} className={tot ? "tot" : undefined} style={style} data-l={rotulo}>
        {n(v.length)}
        <small>{a ? `${n(a)} ${pl(a, "atrasada", "atrasadas")}` : "no prazo"}</small>
      </td>
    );
  };
  const descer = (k: string) => {
    if (lvl === "gestor") setParams({ gestor: k, grupo: null, empresa: null }, true);
    else if (lvl === "grupo") setParams({ grupo: k, empresa: null }, true);
    else setParams({ empresa: k }, true);
  };
  // trilha para subir de nível: Todos os gestores › gestor › grupo › empresa
  const trilha: [string, Partial<Params> | null][] = p.gestor
    ? [
        ["Todos os gestores", { gestor: null, grupo: null, empresa: null }],
        [p.gestor, p.grupo ? { grupo: null, empresa: null } : null],
        ...(p.grupo ? [[p.grupo, p.empresa ? { empresa: null } : null] as [string, Partial<Params> | null]] : []),
        ...(p.empresa ? [[p.empresa, null] as [string, Partial<Params> | null]] : []),
      ]
    : [];

  const filtro = (key: "gestor" | "grupo" | "empresa" | "area" | "tier", label: string, rotulo: string, v: string[]) => (
    <select
      className="f"
      aria-label={rotulo}
      value={p[key] && v.includes(p[key]!) ? p[key]! : ""}
      onChange={(e) => {
        const up: Partial<Params> = { [key]: e.target.value || null };
        if (key === "gestor") Object.assign(up, { grupo: null, empresa: null });
        if (key === "grupo") up.empresa = null;
        setParams(up);
      }}
    >
      <option value="">{label}</option>
      {v.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );

  return (
    <div className="bm">
      <article className="doc" ref={docRef} data-dash-source-state={atualizando ? "refreshing" : undefined}>
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
                <div className="cover-client">
                  <b>BRIEFING</b>&ensp;·&ensp;PRAZOS DO CLIENTE
                </div>
                <select
                  className="ed-sel"
                  aria-label="Edição"
                  value={sel?.id ?? ""}
                  onChange={(e) => {
                    setOpen({});
                    setParams({ ed: e.target.value || null });
                  }}
                >
                  {edicoes?.map((e) => {
                    const x = day(e.data);
                    return (
                      <option key={e.id} value={e.id}>
                        {`${e.id === padrao?.id ? "Atual: " : ""}${DIA[x.getDay()].slice(0, 3)} ${fmtD(e.data)}, ${e.periodo === "tarde" ? "18:00" : "07:00"}`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="bubbles" role="img" aria-label={ok ? bolhas.map((x) => `${x[0]} ${x[1]}`).join(", ") : undefined}>
              {ok &&
                [48, 39, 31].map((r0, i) => {
                  const [v, l, c] = bolhas[i];
                  const r = r0 * k;
                  const digitos = String(v).length;
                  return (
                    <div
                      key={i}
                      className={"bub" + (!v ? " zero" : i === 2 ? " soft" : "")}
                      style={{ width: 2 * r, height: 2 * r, background: c, zIndex: 3 - i, fontSize: Math.round(r * 0.72 * Math.min(1, 3.2 / digitos)) }}
                      title={`${n(v)} ${l}`}
                    >
                      {dd(v)}
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="cover-navy">
            <h1 className="mast" id="edicao">
              <span className="mast-k">{passado ? "Edição anterior, da " : "Edição da "}</span>
              <span className="mast-w">{tarde ? "tarde" : "manhã"}</span>
              <span className="mast-d">
                {hoje ? `${tarde ? "18:00" : "07:00"} · ${DIA[hoje.getDay()]}, ${hoje.getDate()} de ${MES[hoje.getMonth()]}` : "—"}
              </span>
            </h1>
            <div className="say">
              <p className="hello">{!sel ? "—" : passado ? (nome ? `${nome},` : tarde ? "Fechamento." : "Abertura.") : hello}</p>
              <p className="claim">{claim}</p>
              <div className="lead-c">{lead}</div>
            </div>
          </div>
        </header>

        <div className="filters" id="filtros">
          <span className="kicker">Filtrar</span>
          {filtro("gestor", "Todos os gestores", "Gestor da conta", gestores)}
          {filtro("grupo", "Todos os grupos", "Grupo econômico", grupos)}
          {filtro("empresa", "Todas as empresas", "Empresa", empresas)}
          {filtro("area", "Todas as áreas", "Área", areasDisp)}
          {filtro("tier", "Todos os tiers", "Tier do cliente", tiersDisp)}
          <input
            type="search"
            className="q"
            placeholder="Buscar demanda, empresa ou nº do card"
            aria-label="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="evo-btn" onClick={() => setEvo(true)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 12.5 6 7.5l3 2.5 5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Evolução
          </button>
          <button
            type="button"
            className="reset"
            onClick={() => {
              setParams({ gestor: null, grupo: null, empresa: null, area: null, tier: null });
              setQ("");
            }}
          >
            Limpar
          </button>
        </div>

        <Evolucao
          aberto={evo}
          onFechar={() => setEvo(false)}
          filtros={{ gestor: p.gestor, grupo: p.grupo, empresa: p.empresa, area: p.area, tier: p.tier }}
        />

        <div className="sheet">
          <div className="next" id="comece">
            <span className="lb">{tarde ? "Amanhã, comece por" : "Comece por aqui"}</span>
            <p>
              {ok && top ? (
                <>
                  <b>{`${top.demanda} de ${top.empresa}`}</b>
                  {`, ${top.dias_atraso ? `${n(top.dias_atraso)} ${pl(top.dias_atraso, "dia", "dias")} de atraso` : "prazo no dia"}. Confirme o andamento com a área responsável e, se precisar, alinhe com o cliente.`}
                </>
              ) : ok ? (
                "Nada pendente neste recorte."
              ) : (
                "—"
              )}
            </p>
            <a href={topLink ?? "#"} target="_blank" rel="noopener" hidden={!(ok && topLink)}>
              Abrir card no Pipefy
            </a>
          </div>

          <section id="onde-atuar" style={{ marginTop: 52 }}>
            <div className="sec-h">
              <div>
                <span className="kicker">{tarde ? "Fechamento" : "Onde atuar"}</span>
                <h2>
                  {tarde ? (
                    <>
                      O que <b>ficou do dia</b>
                    </>
                  ) : (
                    <>
                      O que <b>{passado ? "precisava de ação" : "precisa de ação hoje"}</b>
                    </>
                  )}
                </h2>
                <p>
                  {tarde
                    ? "O que vencia no dia e não andou vem primeiro: é o que vira atraso amanhã."
                    : "As duas primeiras colunas são o trabalho do dia. A terceira é para antecipar, se sobrar tempo."}
                </p>
              </div>
              <aside className="note">
                Cada linha abre o card no Pipefy. Prazo é a maior data entre os campos de prazo da área; as fases de arquivo e de conclusão não
                entram.
              </aside>
            </div>
            <div className="board" id="board">
              {ok &&
                cols.map(([key, c, title, sub, list, soft]) => {
                  const L = list.slice().sort(urg);
                  const lim = open[key] ? L.length : soft ? 4 : 5;
                  return (
                    <div key={key} className={"col" + (soft ? " soft" : "")} style={{ "--c": c } as CSSProperties}>
                      <div className="col-h">
                        <strong>{n(list.length)}</strong>
                        <span>
                          {title}
                          <small>{sub}</small>
                        </span>
                      </div>
                      <div className="items">
                        {!L.length && <div className="none">{key === "atr" ? "Nenhuma demanda atrasada." : "Nada aqui."}</div>}
                        {L.slice(0, lim).map((it) => {
                          const href = safe(it.link);
                          const corpo = (
                            <>
                              <div className="t">{it.demanda}</div>
                              <div className="d">
                                {it.dias_atraso ? (
                                  <>
                                    <b className="crit">{n(it.dias_atraso)}</b>
                                    <small>{pl(it.dias_atraso, "dia de atraso", "dias de atraso")}</small>
                                  </>
                                ) : (
                                  <>
                                    <b>{fmtD(it.prazo)}</b>
                                    <small>{it.off === 0 ? "prazo no dia" : `em ${it.off} ${pl(it.off, "dia", "dias")}`}</small>
                                  </>
                                )}
                              </div>
                              <div className="c">{it.empresa}</div>
                              <div className="m">
                                {`${SIG[it.area] || it.area} · `}
                                <span className="tier">
                                  <i style={{ background: COR_TIER[it.tier] }} className={COR_TIER[it.tier] ? undefined : "sem"} />
                                  {it.tier}
                                </span>
                                {` · ${p.gestor ? it.grupo : it.gestor}`}
                              </div>
                            </>
                          );
                          return href ? (
                            <a key={it.item_id} className="it" href={href} target="_blank" rel="noopener" title={`Abrir card ${it.card_id} no Pipefy`}>
                              {corpo}
                            </a>
                          ) : (
                            <div key={it.item_id} className="it">
                              {corpo}
                            </div>
                          );
                        })}
                      </div>
                      {L.length > lim && (
                        <button type="button" className="more" onClick={() => setOpen((o) => ({ ...o, [key]: true }))}>
                          {`Ver mais ${n(L.length - lim)}`}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>

          <div className="rule" />

          <section id="carteiras">
            <div className="sec-h">
              <div>
                <span className="kicker">Visão gerencial</span>
                <h2>
                  {lvl === "gestor" ? (
                    <>
                      Carteiras <b>lado a lado</b>
                    </>
                  ) : lvl === "grupo" ? (
                    <>
                      Carteira de <b>{p.gestor}</b>
                    </>
                  ) : (
                    <>
                      <b>{p.grupo}</b>, por empresa
                    </>
                  )}
                </h2>
                <p>
                  {lvl === "gestor"
                    ? "Quem tem mais atraso aparece primeiro. Clique no nome do gestor para abrir só a carteira dele."
                    : "Clique no nome para descer um nível."}
                </p>
              </div>
              <aside className="note">Cada célula conta as demandas na área. Quanto mais escura, maior a parte atrasada.</aside>
            </div>
            {trilha.length > 0 && (
              <nav className="crumbs" aria-label="Nível da visão gerencial">
                {trilha.map(([rot, up], i) => (
                  <span key={i}>
                    {i > 0 && <i aria-hidden="true">›</i>}
                    {up ? (
                      <button type="button" onClick={() => setParams(up, true)}>
                        {i === 0 ? "← " + rot : rot}
                      </button>
                    ) : (
                      <b aria-current="page">{rot}</b>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <div className="mx">
              {ok && (
                <table style={{ "--cols": areasMx.length + 1 } as CSSProperties}>
                  <thead>
                    <tr>
                      <th />
                      {areasMx.map((a) => (
                        <th key={a}>{`${a} (${SIG[a]})`}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasMx.map(([nomeLinha, v]) => {
                      const ne = new Set(v.map((r) => r.empresa)).size;
                      // gestor mistura todos os tiers; grupo e empresa quase sempre têm um só
                      const tiers = lvl === "gestor" ? [] : uniq(v.map((r) => r.tier)).sort((a, b) => ordemTier(a) - ordemTier(b));
                      return (
                        <tr key={nomeLinha}>
                          <th className="rh">
                            <button type="button" onClick={() => descer(nomeLinha)}>
                              {tiers.length > 0 && (
                                <span className="tiers" title={tiers.join(", ")} aria-label={`Tier: ${tiers.join(", ")}`}>
                                  {tiers.map((t) => (
                                    <i key={t} style={{ background: COR_TIER[t] }} className={COR_TIER[t] ? undefined : "sem"} />
                                  ))}
                                </span>
                              )}
                              {nomeLinha}
                            </button>
                            {lvl !== "empresa" && <small>{`${n(ne)} ${pl(ne, "empresa", "empresas")}`}</small>}
                          </th>
                          {areasMx.map((a) => cell(v.filter((r) => r.area === a), false, a))}
                          {cell(v, true, "tot")}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="scale">
              <span>Menos atraso</span>
              <i />
              <span>Mais atraso</span>
            </div>
          </section>
        </div>

        <footer className="foot">
          <span>Relatório gerado automaticamente a partir do pipe de Solicitação de Serviços.</span>
          <span className="pg">BR MED · Suporte</span>
        </footer>
      </article>
    </div>
  );
}
