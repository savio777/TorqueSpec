import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const controlClass =
  "rounded-lg border border-border bg-bg px-3 text-fg placeholder:text-subtle focus:border-brand focus:outline-none disabled:opacity-60";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );
}

type ControlSize = { controlSize?: "sm" | "md" };
const SIZES = { sm: "h-8 text-xs", md: "h-10 text-sm" };

/** Ocupa a largura do container por padrão; passe uma largura em `className` para sobrescrever. */
const widthClass = (className: string) => (/(^|\s)(max-)?w-/.test(className) ? "" : "w-full");

export function Input({ className = "", controlSize = "md", ...props }: InputHTMLAttributes<HTMLInputElement> & ControlSize) {
  return <input {...props} className={`${controlClass} ${SIZES[controlSize]} ${widthClass(className)} ${className}`} />;
}

export function Select({ className = "", controlSize = "md", ...props }: SelectHTMLAttributes<HTMLSelectElement> & ControlSize) {
  return <select {...props} className={`${controlClass} ${SIZES[controlSize]} ${widthClass(className)} ${className}`} />;
}
