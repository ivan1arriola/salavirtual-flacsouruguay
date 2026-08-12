"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarLink({
  href,
  exact = false,
  className,
  children
}: Readonly<{
  href: string;
  exact?: boolean;
  className?: string;
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={[className, active ? "is-active" : null].filter(Boolean).join(" ") || undefined}
      href={href}
    >
      {children}
    </Link>
  );
}
