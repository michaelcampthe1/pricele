import type { Metadata } from "next";
import { Prose, DraftNotice } from "@/components/shared/prose";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <Prose>
      <h1>Terms of service</h1>
      <DraftNotice />
      <h2>The game</h2>
      <p>Pricele is a free daily game for entertainment. Questions and answers are researched and sourced carefully, but prices change and sources can contain errors. Nothing on Pricele is financial, investment, shopping or legal advice.</p>
      <h2>Fair play</h2>
      <ul>
        <li>One official guess per question per player. Don&apos;t use multiple accounts, automation, or exploits to gain an advantage.</li>
        <li>Choose a username that isn&apos;t offensive, misleading or impersonating someone.</li>
        <li>We may suspend accounts that break these rules or abuse the service. Suspended accounts are removed from leaderboards.</li>
      </ul>
      <h2>Corrections</h2>
      <p>If a published answer turns out to be wrong, it may be corrected. Corrections are applied the same way to every player who answered that question, and affected scores, leaderboards and streaks are recalculated. Corrections are shown publicly with the reason and source.</p>
      <h2>Your account</h2>
      <p>You are responsible for keeping your login secure. You can delete your account at any time from your profile.</p>
      <h2>Availability</h2>
      <p>We aim to publish a new game every day at midnight Eastern Time but don&apos;t guarantee uninterrupted availability. A day without a published game does not break streaks.</p>
      <h2>Changes</h2>
      <p>These terms may change. Material changes will be announced on the site.</p>
    </Prose>
  );
}
