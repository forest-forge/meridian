import type { Wallet } from "./store.ts";

export function walletLines(wallet: Wallet): Array<[string, string]> {
  return (
    [
      ["Name", wallet.name],
      ["Conditions", wallet.conditions],
      ["Clinic phone", wallet.clinic],
      ["Emergency contact", wallet.emergency],
      ["Insurance", wallet.insurance],
    ] as Array<[string, string]>
  ).filter(([, value]) => value.trim());
}
