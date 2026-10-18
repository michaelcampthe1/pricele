import type { Metadata } from "next";
import { Prose } from "@/components/shared/prose";
import { CONTACT_EMAIL, POLICIES_UPDATED, SITE_DOMAIN } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <Prose>
      <h1>Terms of service</h1>
      <p className="text-sm text-muted">Last updated {POLICIES_UPDATED}</p>
      <p>By using Pricele ({SITE_DOMAIN}) you agree to these terms. If you don&apos;t agree, please don&apos;t use the site.</p>
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
      <h2>Contact</h2>
      <p>Questions about these terms: email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </Prose>
  );
}
