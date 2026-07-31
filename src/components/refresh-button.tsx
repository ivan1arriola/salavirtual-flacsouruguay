"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="secondary-action"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      <RefreshCw className={pending ? "spin" : undefined} size={17} aria-hidden="true" />
      {pending ? "Actualizando…" : "Actualizar"}
    </button>
  );
}
