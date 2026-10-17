import { Alert } from "@/components/ui/alert";

/** Persistent confirmation after a guest-progress claim (driven by ?claimed=&skipped=). */
export function ClaimedNotice({ claimed, skipped }: { claimed?: string; skipped?: string }) {
  if (claimed === undefined) return null;
  const c = Number(claimed) || 0;
  const s = Number(skipped) || 0;
  return (
    <Alert tone={c > 0 ? "success" : "info"} role="status">
      {c > 0
        ? `Saved ${c} ${c === 1 ? "day" : "days"} of guest progress to your account.${s ? ` ${s} skipped because you'd already played those days on this account.` : ""}`
        : "Nothing new to save — you'd already played those days on this account, so your account results stand."}
    </Alert>
  );
}
