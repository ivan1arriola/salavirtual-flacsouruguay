import { redirect } from "next/navigation";

export default function ReunionesDelMesPage() {
  redirect("/mi-agenda?tab=mes");
}
