import Link from "next/link";
import { getViewer } from "@/lib/auth/session";
import { Avatar } from "@/components/shared/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "./logo";
import { NavLinks } from "./nav-links";
import { MobileNav, UserMenu } from "./menus";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <nav aria-label="Main" className="relative mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <MobileNav />
        <Link href="/" className="mr-2 rounded-[var(--radius-sm)]" aria-label="Pricele home">
          <Wordmark />
        </Link>
        <NavLinks className="hidden items-center gap-1 md:flex" />
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <UserMenu
              label={viewer.displayName ?? viewer.username}
              avatar={<Avatar name={viewer.username} url={viewer.avatarUrl} size={30} />}
              items={[
                { href: "/profile", label: "Your profile & stats" },
                ...(viewer.isPublic ? [{ href: `/profile/${viewer.username}`, label: "Public profile" }] : []),
                ...(viewer.isAdmin ? [{ href: "/admin", label: "Admin dashboard" }] : []),
              ]}
              footer={
                <form action="/auth/signout" method="post">
                  <button type="submit" className="block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-muted hover:text-ink">
                    Sign out
                  </button>
                </form>
              }
            />
          ) : (
            <>
              <Link href="/login" className="hidden rounded-[var(--radius-sm)] px-3 py-2 text-[15px] font-medium text-ink-soft hover:text-ink sm:block">
                Sign in
              </Link>
              <ButtonLink href="/signup" size="sm" variant="secondary">
                Create account
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
