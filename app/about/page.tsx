import type { Metadata } from "next";
import { publicEnv } from "@/lib/env";
import { Prose } from "@/components/shared/prose";
import { Card } from "@/components/ui/card";
import { FeedbackForm } from "@/components/shared/feedback-form";

export const metadata: Metadata = { title: "About", description: "How Pricele works, how questions are sourced, and how scoring works.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  const contact = publicEnv().contactEmail;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-[-0.01em]">About Pricele</h1>
      <Prose>
        <p className="mt-4">
          Pricele is a daily price-guessing game. Every day at midnight Eastern Time, everyone gets the same three questions — Easy, Medium and Hard — about real-world prices: products, deals, budgets, auctions, contracts and more.
        </p>
        <h2>Scoring</h2>
        <p>
          Each question is worth up to 1,000 points, regardless of difficulty. Your score is <code>round(1000 ÷ (1 + |ln(guess ÷ answer)|))</code>. It measures how many times too high or too low you were, so overestimating and underestimating by the same factor score the same: being exactly right earns 1,000, being off by a factor of two earns 591, and a factor of ten earns 303.
        </p>
        <h2>Where answers come from</h2>
        <p>
          Every published question has a precisely defined target (for example, equity value versus enterprise value), a reference date, and at least one source recorded and checked by a person before publication. AI tools may help draft ideas, but they never publish questions or set answers. Sources are linked with each answer.
        </p>
        <h2>Corrections</h2>
        <p>
          If a published answer turns out to be wrong, it is corrected through an audited process: every player&apos;s guess is rescored the same way, leaderboards update, and a correction note appears with the answer. A question that can&apos;t be fixed fairly is withdrawn and not scored for anyone.
        </p>
      </Prose>
      <section id="contact" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-semibold">Contact &amp; feedback</h2>
        {contact ? (
          <p className="mt-2 text-ink-soft">
            Email <a className="text-accent-strong underline" href={`mailto:${contact}`}>{contact}</a>, or use the form below.
          </p>
        ) : (
          <p className="mt-2 text-ink-soft">Send the Pricele team a message — including reports of incorrect answers and privacy requests.</p>
        )}
        <Card className="mt-4 p-5 sm:p-6">
          <FeedbackForm />
        </Card>
      </section>
    </div>
  );
}
