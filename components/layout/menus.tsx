"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NavLinks } from "./nav-links";

/** Closes on Escape, outside click and route change; returns focus to the trigger on Escape. */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  return { open, setOpen, ref, triggerRef };
}

export function MobileNav() {
  const { open, setOpen, ref, triggerRef } = useDisclosure();
  const id = useId();
  return (
    <div ref={ref} className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="inline-flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-ink hover:bg-surface-muted"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      <div
        id={id}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-bg px-4 pb-4 pt-2 shadow-pop"
      >
        <NavLinks className="flex flex-col gap-1" onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}

export function UserMenu({
  label,
  avatar,
  items,
  footer,
}: {
  label: string;
  avatar: ReactNode;
  items: { href: string; label: string }[];
  footer: ReactNode;
}) {
  const { open, setOpen, ref, triggerRef } = useDisclosure();
  const id = useId();
  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface pl-1 pr-3 text-sm font-medium text-ink hover:border-border-strong"
      >
        {avatar}
        <span className="max-w-28 truncate">{label}</span>
        <span className="sr-only">account menu</span>
      </button>
      <div
        id={id}
        hidden={!open}
        className={cn(
          "absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-[var(--radius)] border border-border bg-surface p-1.5 shadow-pop",
        )}
      >
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-border pt-1">{footer}</div>
      </div>
    </div>
  );
}
