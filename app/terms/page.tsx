import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/shared/prose";
import { DraftNotice } from "@/components/shared/draft-notice";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-[-0.01em]">Terms of service</h1>
      <DraftNotice />
      <Prose>
        <h2>The game</h2>
        <p>Pricele is a free game for entertainment. Prices, transaction values and other figures are provided for the game, with sources, but are not financial, investment, legal or purchasing advice.</p>
        <h2>Fair play</h2>
        <ul>
          <li>One account per person. Don&apos;t automate play, abuse the service, or try to access answers before submitting.</li>
          <li>Usernames and display names must not impersonate others or be offensive.</li>
          <li>We may suspend accounts that break these rules, and remove affected results from leaderboards.</li>
        </ul>
        <h2>Scores and corrections</h2>
        <p>Scores are calculated by the server. If a published answer is corrected, affected scores are recalculated consistently for every player; withdrawn questions are not scored for anyone. Leaderboard positions can change as a result.</p>
        <h2>Availability</h2>
        <p>The service is provided as is. We aim to publish a new game daily but don&apos;t guarantee it.</p>
        <h2>Contact</h2>
        <p>Questions about these terms: use the <Link href="/about#contact">contact form</Link>.</p>
      </Prose>
    </div>
  );
}
