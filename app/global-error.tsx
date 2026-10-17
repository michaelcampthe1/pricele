"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf8f4", color: "#1c1b18", textAlign: "center", padding: "80px 16px" }}>
        <h1 style={{ fontSize: 24 }}>Pricele is having trouble</h1>
        <p>Please try again in a moment.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
        <button onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: 0, background: "#1b7349", color: "#fff" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
