import type { Metadata } from "next";
import { Prose } from "@/components/shared/prose";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Pricele",
  description: "How Pricele works: three daily price questions, logarithmic scoring, and carefully sourced answers.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <Prose>
      <h1>About Pricele</h1>
      <p>Pricele is a daily game about what things cost. Every day there are three new questions — easy, medium and hard — drawn from products, deals, buildings, sports, entertainment and more. You get one guess for each.</p>
      <h2>Scoring</h2>
      <p>Each question is worth up to 1,000 points, for up to 3,000 a day. Scores depend on how far your guess is from the answer in ratio terms, not dollars:</p>
      <p className="rounded-[10px] bg-sunk p-4 text-center font-display text-lg !text-ink">score = 1000 ÷ (1 + |ln(guess ÷ answer)|)</p>
      <ul>
        <li>Exactly right: 1,000 points.</li>
        <li>Twice too high or half too low: about 591 points.</li>
        <li>Ten times too high or ten times too low: about 303 points.</li>
      </ul>
      <p>So a $50 miss on a $100 item counts the same as a $500 million miss on a $1 billion deal. Difficulty labels describe how hard a question is to estimate; they don&apos;t change the points available.</p>
      <h2>Answers and sources</h2>
      <p>Every answer is checked by an editor against at least one reliable source — company announcements, official filings, government records, auction results, retailer listings or reputable reporting — and each reveal links to it. Questions spell out exactly what is being measured, such as equity value versus enterprise value, or a product&apos;s price at a named retailer on a given date.</p>
      <p>If an answer is wrong, it&apos;s corrected openly: the old and new answers, the reason and the source are shown, and every affected player&apos;s score is recalculated the same way. Spot a problem? Use &quot;Report a problem&quot; under any answer.</p>
      <h2>Daily reset and streaks</h2>
      <p>A new game starts at midnight Eastern Time. Finish all three questions on consecutive game days to build a streak. Signed-in players appear on the daily, weekly (Monday to Sunday) and all-time leaderboards. Past games stay playable in the archive as practice, which never affects official scores.</p>
      <h2 id="contact">Contact and feedback</h2>
      <p>
        Questions, ideas, bug reports or business inquiries: email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. To flag a wrong answer, the quickest way is the &quot;Report a
        problem&quot; link under any answer.
      </p>
    </Prose>
  );
}
