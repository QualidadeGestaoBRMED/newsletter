import { Suspense } from "react";
import Painel from "./painel";

export default function Page() {
  return (
    <Suspense>
      <Painel />
    </Suspense>
  );
}
