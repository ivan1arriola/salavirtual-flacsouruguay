"use client";

import { Check, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function NotificationReadButton({
  notificationId
}: Readonly<{ notificationId: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function markRead() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/v1/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "No se pudo marcar como leida.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="notification-action-wrap">
      <button
        className="icon-button"
        disabled={pending}
        onClick={markRead}
        title="Marcar como leida"
        type="button"
      >
        <Check size={17} aria-hidden="true" />
        <span className="sr-only">Marcar como leida</span>
      </button>
      {error ? <small className="inline-error" role="alert">{error}</small> : null}
    </span>
  );
}

export function NotificationReadAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markAllRead() {
    startTransition(async () => {
      const response = await fetch("/api/v1/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true })
      });
      if (response.ok) router.refresh();
    });
  }

  return (
    <button
      className="secondary-action"
      disabled={pending}
      onClick={markAllRead}
      type="button"
    >
      <CheckCheck size={17} aria-hidden="true" />
      Marcar todas como leidas
    </button>
  );
}
