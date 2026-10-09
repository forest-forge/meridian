import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-fg",
        variant === "quiet" && "bg-surface-2 text-fg",
        variant === "danger" && "border border-line bg-surface text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-1 block text-sm text-subtle">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const control =
  "h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-fg";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={control} {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "h-auto py-3")} {...props} />;
}

export function Choice<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 grid gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface px-3 py-3",
                selected ? "border-accent" : "border-line",
              )}
            >
              <input
                type="radio"
                name={legend}
                className="mt-1 size-4"
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                {option.hint ? <span className="mt-1 block text-sm text-subtle">{option.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-bg">
      <div className="sheet mx-auto min-h-dvh w-full max-w-lg px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
          <Button variant="quiet" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        <div className="mt-6 grid gap-5">{children}</div>
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-subtle">{children}</p>;
}
