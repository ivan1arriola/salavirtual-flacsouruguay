import { redirect } from "next/navigation";

export default function MiHistoricoPage() {
  redirect("/mi-agenda?tab=historico");
}
