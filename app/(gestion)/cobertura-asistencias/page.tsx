import { permanentRedirect } from "next/navigation";

export default async function CoberturaAsistenciasAnterior({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}>) {
  const source = await searchParams;
  const target = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      target.set(key, value);
    } else if (value) {
      value.forEach((item) => target.append(key, item));
    }
  }
  const query = target.toString();
  permanentRedirect(`/monitoreo${query ? `?${query}` : ""}`);
}
