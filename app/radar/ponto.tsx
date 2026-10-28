import { COR_TIER } from "@/lib/painel";

/** Tier sempre com a sua cor: o mesmo pontinho do painel. */
export const ponto = (t: string) => <i className={"rd-dot" + (COR_TIER[t] ? "" : " sem")} style={{ background: COR_TIER[t] }} aria-hidden="true" />;
