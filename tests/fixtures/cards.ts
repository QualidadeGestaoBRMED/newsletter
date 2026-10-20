// Fixtures no formato real da API do Pipefy (card.fields: value / date_value / datetime_value / connectedRepoItems),
// copiado do card 1072838822 consultado em 2026-10-20. Nomes de empresas e pessoas anonimizados.
import type { CampoCru, CardCru, Databases } from "../../jobs/regras";

/** Campo datetime como a API devolve: value em hora de SP, datetime_value em UTC. */
export function dt(isoUtc: string): CampoCru {
  const d = new Date(isoUtc);
  const sp = new Date(d.getTime() - 3 * 3600e3); // SP é UTC−3 fixo desde 2019
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    value: `${p(sp.getUTCDate())}/${p(sp.getUTCMonth() + 1)}/${sp.getUTCFullYear()} ${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}`,
    date_value: sp.toISOString().slice(0, 10),
    datetime_value: d.toISOString().replace(".000Z", "+00:00"),
  };
}

export const vazio: CampoCru = { value: "", date_value: null, datetime_value: null };
export const checklistVazio: CampoCru = { value: "[]", array_value: [] };
export const checklistOk: CampoCru = { value: '["OK"]', array_value: ["OK"] };

export function card(campos: Record<string, CampoCru>, extra: Partial<CardCru> = {}): CardCru {
  return {
    id: "1072838822",
    title: "EDIFICIO EXEMPLO",
    fase: { id: "315003836", nome: "Aguardando Retorno do Cliente" },
    campos: {
      nome_da_empresa_conforme_br_net: { value: "EDIFICIO EXEMPLO" },
      grupo_econ_mico_conforme_br_net: { value: "GRUPO EXEMPLO" },
      tipo_de_documento: { value: "PGR/PCMSO" },
      informar_o_respons_vel_pela_sua_conta_na_br_med_restored: {
        value: '["Flávia Exemplo"]',
        array_value: ["522383966"],
        connectedRepoItems: [{ id: "522383966", title: "Flávia Exemplo" }],
      },
      ...campos,
    },
    ...extra,
  };
}

/** Card real anonimizado: todos os prazos de ST/SO/OG preenchidos, Relatório Anual vazio. */
export const cardReal = card({
  prazo_so: { value: "14/02/2025 15:24", date_value: "2025-02-14", datetime_value: "2025-02-14T18:24:07+00:00" },
  prazo_manuten_o_br_net: { value: "18/02/2025 15:24", date_value: "2025-02-18", datetime_value: "2025-02-18T18:24:07+00:00" },
  prazo_seguran_a_do_trabalho: { value: "11/02/2025 15:24", date_value: "2025-02-11", datetime_value: "2025-02-11T18:24:07+00:00" },
  prazo_sa_de_ocupacional: { value: "14/02/2025 15:24", date_value: "2025-02-14", datetime_value: "2025-02-14T18:24:07+00:00" },
  prazo_st: { value: "11/02/2025 15:24", date_value: "2025-02-11", datetime_value: "2025-02-11T18:24:07+00:00" },
});

export function databases(): Databases {
  const flavia = { nome: "Flávia Exemplo", email: "flavia.exemplo@grupobrmed.com.br" };
  const patricia = { nome: "Patrícia Exemplo", email: "patricia.exemplo@grupobrmed.com.br" };
  return {
    gestorPorRegistro: new Map([["522383966", flavia]]),
    gestorPorNome: new Map([
      ["flavia exemplo", flavia],
      ["patricia exemplo", patricia],
    ]),
    coordenadorPorEmpresa: new Map([["empresa da base", "Patricia Exemplo"]]),
    coordenadorPorGrupo: new Map([["grupo da base", "Karen Exemplo"]]),
    tierPorEmpresa: new Map([["edificio exemplo", "Ouro"]]),
  };
}
