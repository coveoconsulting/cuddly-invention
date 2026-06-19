import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-dashed border-outline bg-surface-container-lowest px-5 py-8 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-base font-bold text-on-surface">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-secondary">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
