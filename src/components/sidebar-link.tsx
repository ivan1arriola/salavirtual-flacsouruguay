"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavigationItemActive } from "@/src/components/app-navigation";

export function SidebarLink({
  href,
  exact = false,
  className,
  dataTour,
  activeSearch,
  children,
}: Readonly<{
  href: string;
  exact?: boolean;
  className?: string | undefined;
  dataTour?: string | undefined;
  activeSearch?: Readonly<{ key: string; value: string; defaultActive?: boolean }> | undefined;
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = isNavigationItemActive(
    { href, search: activeSearch },
    pathname,
    searchParams,
    exact,
  );

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={[className, active ? "is-active" : null].filter(Boolean).join(" ") || undefined}
      data-tour={dataTour}
      href={href}
    >
      {children}
    </Link>
  );
}
