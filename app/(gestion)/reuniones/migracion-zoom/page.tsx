import { redirect } from "next/navigation";

export default function MigracionZoomPage() {
  redirect("/reuniones?proveedor=zoom&vista=series");
}
