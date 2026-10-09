import type { Wallet } from "@/lib/store";
import { walletLines } from "@/lib/wallet";

export function WalletCard({ wallet }: { wallet: Wallet }) {
  const lines = walletLines(wallet);
  if (lines.length === 0) return null;
  const name = lines.find(([label]) => label === "Name")?.[1] ?? "";
  const rest = lines.filter(([label]) => label !== "Name");
  return (
    <section className="rounded-xl border-2 border-fg bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-subtle">Wallet card</p>
      {name ? <p className="mt-1 font-display text-2xl font-medium">{name}</p> : null}
      {rest.map(([label, value]) => (
        <p key={label} className="mt-1 text-sm">
          <span className="text-subtle">{label}. </span>
          {value}
        </p>
      ))}
    </section>
  );
}
