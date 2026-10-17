"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV, isActive } from "@/components/layout/nav-links";
import { signOutAction } from "@/lib/auth/actions";

/** Accessible disclosure menu for small screens. */
export function MobileNav({ signedIn, username, isAdmin }: { signedIn: boolean; username: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? "page" : undefined}
      className="block rounded-md px-3 py-3 text-base font-medium text-ink aria-[current=page]:bg-green-wash aria-[current=page]:text-green-strong"
    >
      {label}
    </Link>
  );

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-sunk"
      >
        {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
      </button>
      {open && (
        <div ref={panelRef} id="mobile-menu" className="absolute inset-x-0 top-16 border-b border-line bg-paper px-4 pb-5 pt-2 shadow-sm">
          <nav aria-label="Mobile">
            {NAV.map((n) => link(n.href, n.label))}
            <div className="my-2 border-t border-line" />
            {signedIn ? (
              <>
                {link("/profile", username ? `Profile (@${username})` : "Profile")}
                {isAdmin && link("/admin", "Admin dashboard")}
                <form action={signOutAction}>
                  <button type="submit" className="block w-full rounded-md px-3 py-3 text-left text-base font-medium text-ink-soft">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                {link("/login", "Sign in")}
                {link("/signup", "Create account")}
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
