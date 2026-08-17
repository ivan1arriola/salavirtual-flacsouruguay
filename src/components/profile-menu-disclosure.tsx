"use client";

import { useEffect, useRef } from "react";

export function DismissibleDetails({
  className,
  dataTour,
  children
}: Readonly<{
  className: string;
  dataTour?: string;
  children: React.ReactNode;
}>) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeMenu({ restoreFocus = false } = {}) {
      const details = detailsRef.current;
      if (!details?.open) return;

      details.open = false;

      if (restoreFocus) {
        details.querySelector<HTMLElement>("summary")?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open) return;

      const target = event.target;
      if (target instanceof Node && !details.contains(target)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      const details = detailsRef.current;
      if (!details?.open) return;

      event.preventDefault();
      closeMenu({ restoreFocus: true });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details className={className} data-tour={dataTour} ref={detailsRef}>
      {children}
    </details>
  );
}

export function ProfileMenuDisclosure({
  className,
  children
}: Readonly<{
  className: string;
  children: React.ReactNode;
}>) {
  return <DismissibleDetails className={className}>{children}</DismissibleDetails>;
}
