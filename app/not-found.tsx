import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-display text-7xl font-bold tracking-tight text-line-strong">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">The link may be broken, or the page may have moved.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/play">Play today&apos;s game</ButtonLink>
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
      </div>
    </div>
  );
}
