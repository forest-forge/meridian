import { createContext, useContext, type ReactNode } from "react";

export type Tab = "today" | "kit" | "journey" | "log";

export type ShellValue = {
  now: Date;
  phoneTz: string;
  planDay: string | null;
  setPlanDay: (day: string | null) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
};

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellValue; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("Meridian shell is missing");
  return value;
}
