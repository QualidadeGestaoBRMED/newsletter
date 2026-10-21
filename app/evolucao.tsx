"use client";
// Modal de evolução: contagens de cada edição da manhã no recorte dos filtros do painel, em gráfico de linha.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PontoSerie } from "@/lib/painel";

export type Filtros = { gestor: string | null; grupo: string | null; empresa: string | null; area: string | null; tier: string | null };
type Carga = { qs: string; status: "loading" | "ok" | "error"; serie: PontoSerie[] };

// Ferrugem, âmbar e aqua da marca, ajustados para as três linhas se distinguirem (validado, inclusive daltonismo).
// Âmbar e aqua têm pouco contraste com o branco: por isso há legenda, rótulos em texto e a tabela.
const SERIES = [
  { k: "vencidas", nome: "Prazo vencido", cor: "#cc0000" },
  { k: "hoje", nome: "Vence hoje", cor: "#cc851e" },
  { k: "radar", nome: "Próximos 2 dias", cor: "#2cad6e" },
] as const;

const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const n = (x: number) => new Intl.NumberFormat("pt-BR").format(x);
const fmtD = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const diaSemana = (s: string) => DIA[new Date(`${s}T12:00:00`).getDay()];

/** Teto "redondo" do eixo y, com 4 intervalos. */
function teto(max: number) {
  if (max <= 0) return 4;
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((s) => s >= bruto)!;
  return passo * 4;
}

function Grafico({ serie }: { serie: PontoSerie[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [idx, setIdx] = useState<number | null>(null);

  const H = 240;
  const ult = serie[serie.length - 1];
  const yMax = teto(Math.max(0, ...serie.flatMap((p) => SERIES.map((s) => p[s.k]))));
  const ih = H - 12 - 26;
  const y = (v: number) => 12 + ih - (v / yMax) * ih;

  // rótulos no fim das linhas só quando não se encostam; senão ficam a legenda e o tooltip
  const ysFim = SERIES.map((s) => y(ult[s.k])).sort((a, b) => a - b);
  const rotulos = W >= 520 && ysFim.every((v, i) => i === 0 || v - ysFim[i - 1] >= 16);
  const M = { l: 44, r: rotulos ? 128 : 16 };
  const iw = Math.max(10, W - M.l - M.r);
  const x = (i: number) => (serie.length === 1 ? M.l + iw / 2 : M.l + (i * iw) / (serie.length - 1));
  const ticksY = [0, 1, 2, 3, 4].map((k) => (yMax / 4) * k);
  const passoX = Math.max(1, Math.ceil(serie.length / Math.max(2, Math.floor(iw / 70))));

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = serie.length === 1 ? 0 : Math.round(((px - M.l) / iw) * (serie.length - 1));
    setIdx(Math.min(serie.length - 1, Math.max(0, i)));
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setIdx((i) => Math.min(serie.length - 1, Math.max(0, (i ?? serie.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const p = idx !== null ? serie[idx] : null;
  const tipEsq = p ? (x(idx!) + 14 + 170 > W ? x(idx!) - 14 - 170 : x(idx!) + 14) : 0;

  return (
    <div className="graf" ref={caixa}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="img"
        aria-label={`Evolução por edição da manhã. Última, ${fmtD(ult.data)}: ${SERIES.map((s) => `${n(ult[s.k])} ${s.nome.toLowerCase()}`).join(", ")}. Use as setas para percorrer as edições.`}
        onKeyDown={teclado}
        onFocus={() => setIdx(serie.length - 1)}
        onBlur={() => setIdx(null)}
      >
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} stroke="#ECEEEF" strokeWidth={1} />
            <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tk">
              {n(t)}
            </text>
          </g>
        ))}
        {serie.map((pt, i) =>
          i % passoX === 0 || i === serie.length - 1 ? (
            <text key={pt.id} x={x(i)} y={H - 6} textAnchor="middle" className="tk">
              {fmtD(pt.data)}
            </text>
          ) : null,
        )}

        {idx !== null && <line x1={x(idx)} x2={x(idx)} y1={12} y2={12 + ih} stroke="#BFC3C6" strokeWidth={1} />}

        {SERIES.map((s) => (
          <g key={s.k}>
            {serie.length > 1 && (
              <path
                d={serie.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt[s.k]).toFixed(1)}`).join("")}
                fill="none"
                stroke={s.cor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {[serie.length - 1, ...(idx !== null && idx !== serie.length - 1 ? [idx] : [])].map((i) => (
              <circle key={i} cx={x(i)} cy={y(serie[i][s.k])} r={4} fill={s.cor} stroke="#fff" strokeWidth={2} />
            ))}
            {rotulos && (
              <text x={M.l + iw + 12} y={y(ult[s.k])} dy="0.32em" className="fim">
                <tspan className="v">{n(ult[s.k])}</tspan> {s.nome.toLowerCase()}
              </text>
            )}
          </g>
        ))}

        <rect x={M.l - 10} y={0} width={iw + 20} height={H} fill="transparent" onPointerMove={mover} onPointerLeave={() => setIdx(null)} />
      </svg>

      {p && (
        <div className="tip" style={{ left: tipEsq, top: 8 }} aria-hidden="true">
          <div className="dt">{`${diaSemana(p.data)} ${fmtD(p.data)}, 07:00`}</div>
          {SERIES.map((s) => (
            <div key={s.k} className="r">
              <i style={{ background: s.cor }} />
              <b>{n(p[s.k])}</b>
              <span>{s.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Evolucao({ aberto, onFechar, filtros }: { aberto: boolean; onFechar: () => void; filtros: Filtros }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const qs = new URLSearchParams(Object.entries(filtros).filter((kv): kv is [string, string] => !!kv[1])).toString();
  const [carga, setCarga] = useState<Carga | null>(null);
  const [tabela, setTabela] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    // recarregar mantém o gráfico anterior esmaecido, sem piscar
    setCarga((c) => (c ? { ...c, status: "loading" } : { qs, status: "loading", serie: [] }));
    fetch(`/api/serie?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => vivo && setCarga({ qs, status: "ok", serie: j.serie }))
      .catch(() => vivo && setCarga({ qs, status: "error", serie: [] }));
    return () => {
      vivo = false;
    };
  }, [aberto, qs]);

  const serie = carga?.serie ?? [];
  const ult = serie[serie.length - 1];
  const ant = serie[serie.length - 2];
  const escopo = [filtros.gestor ? `Carteira de ${filtros.gestor}` : "Todas as carteiras", filtros.grupo, filtros.empresa, filtros.area, filtros.tier]
    .filter(Boolean)
    .join(" · ");

  return (
    <dialog ref={ref} className="evo" aria-labelledby="evo-h" onClose={onFechar} onClick={(e) => e.target === ref.current && onFechar()}>
      <button type="button" className="x" aria-label="Fechar" onClick={onFechar}>
        ×
      </button>
      <span className="kicker">Evolução</span>
      <h2 id="evo-h">
        Prazos <b>edição a edição</b>
      </h2>
      <p className="escopo">{escopo}. Uma edição da manhã por dia útil.</p>

      <div data-carregando={carga?.status === "loading" ? "" : undefined}>
        {carga?.status === "error" && <p className="note">Não foi possível carregar a evolução.</p>}
        {!!ult && (
          <>
            <div className="stats">
              {SERIES.map((s) => {
                const d = ant ? ult[s.k] - ant[s.k] : null;
                return (
                  <div key={s.k} className="stat">
                    <span className="lb">
                      <i style={{ background: s.cor }} />
                      {s.nome}
                    </span>
                    <strong>{n(ult[s.k])}</strong>
                    <small>
                      {d === null
                        ? `em ${fmtD(ult.data)}`
                        : d === 0
                          ? `igual a ${fmtD(ant.data)}`
                          : `${d > 0 ? "+" : "−"}${n(Math.abs(d))} desde ${fmtD(ant.data)}`}
                    </small>
                  </div>
                );
              })}
            </div>

            <div className="legenda" aria-hidden="true">
              {SERIES.map((s) => (
                <span key={s.k}>
                  <i style={{ background: s.cor }} />
                  {s.nome}
                </span>
              ))}
            </div>
            <Grafico serie={serie} />

            <div className="rodape">
              <span className="note">
                {serie.length === 1
                  ? "O histórico começa nesta edição: cada edição da manhã acrescenta um ponto."
                  : `${serie.length} edições, de ${fmtD(serie[0].data)} a ${fmtD(ult.data)}. A busca por texto não entra aqui.`}
              </span>
              <button type="button" className="link" onClick={() => setTabela((t) => !t)} aria-expanded={tabela}>
                {tabela ? "Ocultar tabela" : "Ver tabela"}
              </button>
            </div>
            {tabela && (
              <table className="tab">
                <thead>
                  <tr>
                    <th>Edição</th>
                    {SERIES.map((s) => (
                      <th key={s.k}>{s.nome}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {serie
                    .slice()
                    .reverse()
                    .map((pt) => (
                      <tr key={pt.id}>
                        <td>{`${diaSemana(pt.data)} ${fmtD(pt.data)}`}</td>
                        {SERIES.map((s) => (
                          <td key={s.k}>{n(pt[s.k])}</td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
        {carga?.status === "ok" && !ult && <p className="note">Nenhuma edição gerada ainda.</p>}
      </div>
    </dialog>
  );
}
