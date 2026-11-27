"use client";

import { Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

async function notificationError(response: Response, fallback: string): Promise<string> {
  const result: unknown = await response.json().catch(() => null);
  if (typeof result === "object" && result !== null && "error" in result) {
    const message = result.error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

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
}: Readonly<{ notificationId: string; className: string | undefined }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function markRead() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/notificaciones", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          setError(await notificationError(response, "No se pudo marcar como leída."));
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo marcar como leída. Verificá tu conexión e intentá nuevamente.");
      }
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
}: Readonly<{ notificationId: string; className: string | undefined }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    if (!window.confirm("¿Borrar esta notificación?")) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/notificaciones", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          setError(await notificationError(response, "No se pudo borrar la notificación."));
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo borrar la notificación. Verificá tu conexión e intentá nuevamente.");
      }
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
