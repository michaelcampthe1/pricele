import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/shared/prose";
import { DraftNotice } from "@/components/shared/draft-notice";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-[-0.01em]">Privacy policy</h1>
      <DraftNotice />
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account data</strong> (if you sign up): email address, a hashed password managed by our authentication provider, or your Google account identifier and email if you sign in with Google.</li>
          <li><strong>Profile</strong>: username, and optionally a display name and avatar image URL you provide, plus your public/private profile setting.</li>
          <li><strong>Gameplay</strong>: each guess you submit, the answer it was scored against, your score, error and submission time; practice guesses are stored separately.</li>
          <li><strong>Feedback</strong>: messages you send through the contact form and any reply address you choose to include.</li>
          <li><strong>Security data</strong>: a one-way hash of your IP address is used briefly for rate limiting and is deleted within about a day.</li>
        </ul>
        <h2>Cookies and sessions</h2>
        <ul>
          <li><strong>Authentication cookies</strong> keep you signed in (set by Supabase Auth).</li>
          <li><strong>Guest session cookie</strong> (<code>pricele_guest</code>, HttpOnly, 30 days): lets you play without an account. We store only a hash of it. It is removed when you save your guest progress to an account.</li>
        </ul>
        <p>Pricele does not currently use analytics, tracking or advertising cookies. If that changes, this policy will be updated first and consent will be requested where required.</p>
        <h2>How it&apos;s used and shared</h2>
        <p>Data is used to run the game: scoring, streaks, leaderboards, your profile and preventing abuse. Your username, scores and rank appear on public leaderboards. Your profile page and shared result cards are visible only if your profile is public. We do not sell personal data.</p>
        <p>Service providers: Supabase (database and authentication), the hosting provider that serves the site, and Google if you choose Google sign-in.</p>
        <h2>Retention and deletion</h2>
        <p>Account data is kept until you delete your account. You can delete it at any time from <Link href="/profile">your profile</Link>; your profile, official results, streaks and practice history are deleted immediately. Unclaimed guest sessions and their guesses are deleted 30 days after they expire.</p>
        <h2>Contact</h2>
        <p>Privacy questions and requests: use the <Link href="/about#contact">contact form</Link>.</p>
      </Prose>
    </div>
  );
}
