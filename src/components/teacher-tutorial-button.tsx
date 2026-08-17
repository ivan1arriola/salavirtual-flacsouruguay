"use client";

import { CircleHelp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { RESTART_TEACHER_TOUR_EVENT } from "@/src/components/teacher-onboarding-tour";

export function TeacherTutorialButton() {
  const pathname = usePathname();
  const router = useRouter();

  function openTutorial() {
    if (pathname === "/" || pathname === "/reuniones/nueva") {
      window.dispatchEvent(new Event(RESTART_TEACHER_TOUR_EVENT));
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
