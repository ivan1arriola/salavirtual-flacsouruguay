"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatTiempoRestante } from "@/src/modules/asistencia/dashboard-asistente.domain";

export function MeetingCountdown({ startAt }: Readonly<{ startAt: string }>) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="countdown"><Clock3 size={16} />{formatTiempoRestante(Date.parse(startAt), now)}</span>
  );
}
