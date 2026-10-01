import type { ReactNode } from "react";

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="type-label mb-1">{label}</div>
      {children}
    </div>
  );
}
