"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, User } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { signOutAction } from "@/lib/auth/actions";

export function UserMenu({
  username,
  displayName,
  avatarUrl,
  isAdmin,
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink-soft hover:bg-sunk hover:text-ink";

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-sm font-medium text-ink hover:border-line-strong"
      >
        <Avatar name={displayName ?? username} url={avatarUrl} size={28} />
        <span className="max-w-32 truncate">{displayName ?? username}</span>
        <ChevronDown aria-hidden className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 mt-2 w-56 rounded-[12px] border border-line bg-surface p-1.5 shadow-lg shadow-ink/5">
          <p className="px-3 py-2 text-xs text-muted">Signed in as @{username}</p>
          <Link role="menuitem" href="/profile" className={item} onClick={() => setOpen(false)}>
            <User aria-hidden className="h-4 w-4" /> Profile and stats
          </Link>
          {isAdmin && (
            <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
              <LayoutDashboard aria-hidden className="h-4 w-4" /> Admin dashboard
            </Link>
          )}
          <form action={signOutAction}>
            <button role="menuitem" type="submit" className={item}>
              <LogOut aria-hidden className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
