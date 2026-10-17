import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="tabular text-sm font-medium text-accent-strong">404</p>
      <h1 className="mt-2 text-2xl font-semibold">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">It may have moved, or the date or name in the link is wrong.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/play">Today&apos;s game</ButtonLink>
        <ButtonLink href="/archive" variant="secondary">Archive</ButtonLink>
      </div>
    </div>
  );
}
