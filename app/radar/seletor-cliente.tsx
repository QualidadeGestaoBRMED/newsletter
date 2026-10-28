"use client";
// Seletor de cliente do Radar. Não é um <select> porque a opção nativa não mostra a cor do tier.
// Abre uma lista com busca; teclado: setas, Enter e Esc.
import { useEffect, useMemo, useRef, useState } from "react";
import { ponto } from "./ponto";

export type OpcaoCliente = { nome: string; tier: string | null; n: number };

const TODOS = "Todos os clientes";

export default function SeletorCliente({ clientes, valor, onEscolher }: { clientes: OpcaoCliente[]; valor: string | null; onEscolher: (nome: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  const lista = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [null, ...clientes.filter((c) => !ql || c.nome.toLowerCase().includes(ql))] as (OpcaoCliente | null)[];
  }, [clientes, q]);
  const atual = clientes.find((c) => c.nome === valor) ?? null;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const abrir = () => {
    setQ("");
    setAtivo(Math.max(0, clientes.findIndex((c) => c.nome === valor) + 1));
    setAberto(true);
  };
  const escolher = (c: OpcaoCliente | null) => {
    setAberto(false);
    botao.current?.focus();
    if ((c?.nome ?? null) !== valor) onEscolher(c?.nome ?? null);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "ArrowDown") setAtivo((i) => Math.min(lista.length - 1, i + 1));
    else if (e.key === "ArrowUp") setAtivo((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && ativo < lista.length) escolher(lista[ativo]);
    else if (e.key === "Escape") {
      setAberto(false);
      botao.current?.focus();
    }
  };

  return (
    <div className="rd-csel" ref={raiz}>
      <button
        ref={botao}
        type="button"
        className="rd-csel-b"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Cliente"
        onClick={() => (aberto ? setAberto(false) : abrir())}
      >
        {atual ? (
          <>
            {atual.tier && ponto(atual.tier)}
            {atual.nome}
          </>
        ) : (
          valor ?? TODOS
        )}
        <svg className="seta" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {aberto && (
        <div className="rd-csel-p">
          <input
            type="search"
            autoFocus
            placeholder="Buscar cliente"
            aria-label="Buscar cliente"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={tecla}
          />
          <ul role="listbox" aria-label="Clientes">
            {lista.map((c, i) => (
              <li
                key={c?.nome ?? ""}
                role="option"
                aria-selected={(c?.nome ?? null) === valor}
                className={i === ativo ? "ativo" : undefined}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // não tira o foco da busca antes de escolher
                  escolher(c);
                }}
              >
                {c ? (
                  <>
                    {c.tier && ponto(c.tier)}
                    <span className="nm">{c.nome}</span>
                    <span className="n">{c.n}</span>
                  </>
                ) : (
                  <span className="nm">{TODOS}</span>
                )}
              </li>
            ))}
            {lista.length === 1 && <li className="vazio">Nenhum cliente com esse nome</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
