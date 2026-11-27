"use client";

import { useEffect, useRef } from "react";

export function DismissibleDetails({
  className,
  dataTour,
  children,
}: Readonly<{
  className: string;
  dataTour?: string | undefined;
  children: React.ReactNode;
}>) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeMenu({ restoreFocus = false } = {}) {
      const details = detailsRef.current;
      if (!details?.open) {
        return;
      }

      details.open = false;

      if (restoreFocus) {
        details.querySelector<HTMLElement>("summary")?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent | FocusEvent) {
      const details = detailsRef.current;
      if (!details?.open) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !details.contains(target)) {
        closeMenu();
      }
    }

    function handleLinkClick(event: MouseEvent) {
      const details = detailsRef.current;
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") : null;

      const closeButton =
        target instanceof Element ? target.closest("[data-disclosure-close]") : null;

      if (details?.open && closeButton && details.contains(closeButton)) {
        closeMenu({ restoreFocus: true });
        return;
      }

      if (details?.open && link && details.contains(link)) {
        // Close even when selecting the current URL, before client-side navigation.
        closeMenu({ restoreFocus: event.detail === 0 });
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      const details = detailsRef.current;
      if (!details?.open) {
        return;
      }

      event.preventDefault();
      closeMenu({ restoreFocus: true });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleLinkClick, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, []);

  return (
    <details className={className} data-tour={dataTour} ref={detailsRef}>
      {children}
    </details>
  );
}
