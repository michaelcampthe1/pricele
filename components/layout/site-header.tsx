import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { getViewer, type Viewer } from "@/lib/auth/player";
import { logger } from "@/lib/logger";
import { Wordmark } from "@/components/layout/wordmark";
import { NavLinks } from "@/components/layout/nav-links";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { buttonClass } from "@/components/ui/button";

export async function SiteHeader() {
  let viewer: Viewer | null = null;
  try {
    viewer = await getViewer();
  } catch (err) {
    unstable_rethrow(err);
    // Keep the shell usable when the database is unreachable; pages show their own errors.
    logger.error("header.viewer_failed", { error: String(err) });
  }
  const profile = viewer?.profile ?? null;
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Pricele home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <NavLinks />
        </nav>
        <div className="flex items-center gap-2">
          {profile ? (
            <UserMenu username={profile.username} displayName={profile.displayName} avatarUrl={profile.avatarUrl} isAdmin={profile.isAdmin} />
          ) : (
            <div className="hidden items-center gap-1 sm:flex">
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/signup" className={buttonClass("secondary", "sm")}>
                Create account
              </Link>
            </div>
          )}
          <MobileNav signedIn={Boolean(profile)} username={profile?.username ?? null} isAdmin={Boolean(profile?.isAdmin)} />
        </div>
      </div>
    </header>
  );
}
