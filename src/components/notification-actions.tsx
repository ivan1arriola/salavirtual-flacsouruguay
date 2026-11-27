"use client";

import { Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function NotificationMarkReadOnOpen({ unreadCount }: Readonly<{ unreadCount: number }>) {
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (unreadCount === 0 || sent.current) {
      return;
    }
    sent.current = true;

    void fetch("/api/v1/notificaciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
      .then((response) => {
        if (response.ok) {
          router.refresh();
        } else {
          sent.current = false;
        }
      })
      .catch(() => {
        sent.current = false;
      });
  }, [router, unreadCount]);

  return null;
}

export function NotificationReadButton({
  notificationId,
  className,
}: Readonly<{ notificationId: string; className: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function markRead() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/v1/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "No se pudo marcar como leída.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={className}>
      <button
        className="icon-button"
        disabled={pending}
        onClick={markRead}
        title="Marcar como leída"
        type="button"
      >
        <Check size={17} aria-hidden="true" />
        <span className="sr-only">Marcar como leída</span>
      </button>
      {error ? (
        <small className="inline-error" role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}

export function NotificationDeleteButton({
  notificationId,
  className,
}: Readonly<{ notificationId: string; className: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    if (!window.confirm("¿Borrar esta notificación?")) {
      return;
    }
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/v1/notificaciones", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "No se pudo borrar la notificación.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={className}>
      <button
        className="icon-button"
        disabled={pending}
        onClick={remove}
        title="Borrar notificación"
        type="button"
      >
        <Trash2 size={17} aria-hidden="true" />
        <span className="sr-only">Borrar notificación</span>
      </button>
      {error ? (
        <small className="inline-error" role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}
