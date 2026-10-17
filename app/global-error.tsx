"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fafaf7", color: "#1c211e", textAlign: "center", padding: "80px 16px" }}>
        <h1>Pricele is having trouble</h1>
        <p>Please try again in a moment. Your saved progress is safe.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: 0, background: "#1d7348", color: "#fff" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
