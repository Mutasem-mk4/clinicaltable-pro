"use client";

interface PaymentGateProps {
  tablesUsed: number;
  freeLimit: number;
  onPurchase: () => void;
  onSubscribe: () => void;
}

export default function PaymentGate({
  tablesUsed,
  freeLimit,
  onPurchase,
  onSubscribe,
}: PaymentGateProps) {
  if (tablesUsed < freeLimit) {
    return null;
  }

  return (
    <div className="payment-gate">
      <h3>You&apos;ve used your free table</h3>
      <p>
        You&apos;ve generated {tablesUsed} table{tablesUsed !== 1 ? "s" : ""}. To continue,
        choose a plan:
      </p>

      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn" onClick={onPurchase} type="button">
          $4.99 — one table
        </button>
        <button className="btn btn--accent" onClick={onSubscribe} type="button">
          $19/month — unlimited
        </button>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "1rem" }}>
        Powered by Lemon Squeezy. Cancel anytime.
      </p>
    </div>
  );
}
