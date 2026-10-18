import type { Metadata } from "next";
import { adsenseClient } from "@/lib/ads";
import { Prose, DraftNotice } from "@/components/shared/prose";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  const ads = adsenseClient() !== null;
  return (
    <Prose>
      <h1>Privacy policy</h1>
      <DraftNotice />
      <h2>What Pricele collects</h2>
      <ul>
        <li>
          <strong>Account data</strong> (if you create an account): email address, a hashed password managed by our authentication
          provider, or your Google account identifier and email if you sign in with Google.
        </li>
        <li>
          <strong>Profile data</strong>: username, and optionally a display name and avatar image URL, plus your public-profile setting.
        </li>
        <li>
          <strong>Gameplay data</strong>: each guess, when you submitted it, the score it earned and the answer it was compared with;
          practice guesses from the archive; daily results and streaks derived from them.
        </li>
        <li>
          <strong>Reports</strong> you submit about a question.
        </li>
        <li>
          <strong>Operational data</strong>: server logs (without passwords or session secrets) and rate-limit counters keyed by a
          one-way hash of your IP address.
        </li>
      </ul>
      <h2>Cookies and sessions</h2>
      <p>Pricele itself sets only strictly necessary cookies{ads ? " (advertising cookies are described below)" : ""}:</p>
      <ul>
        <li>Authentication cookies set by Supabase Auth to keep you signed in.</li>
        <li>
          A guest-session cookie (HttpOnly, about 30 days) created when you submit your first guess without an account, so your progress
          survives refreshes. Only a one-way hash of its value is stored on our servers.
        </li>
      </ul>
      {ads ? (
        <>
      <h2>Advertising</h2>
      <p>
        Pricele is free and supported by ads shown by Google AdSense on some pages (never while you are answering a question). Google and
        its partners may use cookies or similar technologies to show ads and measure them, including ads based on your previous visits to
        this and other websites. Visitors in the European Economic Area, the UK and Switzerland are asked for consent first. You can turn
        off personalized ads in{" "}
        <a href="https://adssettings.google.com" rel="noopener noreferrer">
          Google&apos;s Ad Settings
        </a>{" "}
        and learn more at{" "}
        <a href="https://policies.google.com/technologies/ads" rel="noopener noreferrer">
          How Google uses information from sites that use its services
        </a>
        . There is no other analytics or advertising tracking.
      </p>
        </>
      ) : (
        <p>There is no analytics or advertising tracking at this time.</p>
      )}
      <h2>How data is used</h2>
      <p>To run the game: score guesses, show results, compute streaks and leaderboards, prevent abuse, and fix incorrect questions. Public profiles and leaderboards show your username, display name, avatar and scores; turn off &quot;Public profile&quot; to appear as &quot;Private player&quot;. Your email is never shown publicly.</p>
      <h2>Service providers</h2>
      <ul>
        <li>Supabase (database and authentication).</li>
        <li>The hosting provider that serves the website (for example Vercel).</li>
        <li>Google, if you choose to sign in with Google{ads ? ", and Google AdSense for advertising (see above)" : ""}.</li>
        <li>If the operator enables the optional AI drafting tool, question topics typed by administrators are sent to the configured AI provider. No player data is sent.</li>
      </ul>
      <h2>Retention and deletion</h2>
      <p>Account and gameplay data are kept while your account exists. Delete your account at any time from your profile page: this permanently removes your account, profile, guesses, results and streaks. Guest sessions expire after about 30 days; unclaimed guest gameplay rows may be retained in anonymous form for game statistics. Administrative audit logs record admin actions, not player content.</p>
      <h2 id="contact">Contact</h2>
      <p>Questions about privacy: use the contact method listed on the <a href="/about#contact">About page</a>.</p>
    </Prose>
  );
}
