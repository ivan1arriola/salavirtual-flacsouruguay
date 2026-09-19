"use client";

import { CircleHelp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { RESTART_ASSISTANT_TOUR_EVENT } from "./assistant-onboarding-tour";

const TOUR_PATHS = ["/", "/agenda-abierta", "/reuniones-del-mes"];

export function AssistantTutorialButton() {
  const pathname = usePathname();
  const router = useRouter();

  function openTutorial() {
    if (TOUR_PATHS.includes(pathname)) {
      window.dispatchEvent(new Event(RESTART_ASSISTANT_TOUR_EVENT));
      return;
    }
    router.push("/?tutorial=1");
  }

  return (
    <button className="profile-menu-action" onClick={openTutorial} type="button">
      <CircleHelp size={18} aria-hidden="true" />
      <span>Ver tutorial</span>
    </button>
  );
}
