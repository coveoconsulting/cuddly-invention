import { cn } from "../lib/utils";
import React from "react";

export function Badge({ children, variant = "default", className }: { children: React.ReactNode; variant?: "default" | "success" | "warning" | "error" | "neutral", className?: string }) {
  const variants = {
    default: "bg-white/80 text-on-surface border border-outline-variant/60 shadow-[0_8px_24px_rgba(21,33,28,0.06)]",
    success: "bg-primary/22 text-carbon border border-primary/25 shadow-[0_8px_24px_rgba(182,243,106,0.18)]",
    warning: "bg-[#fff4dc] text-[#805b14] border border-[#eed49d]",
    error: "bg-error-container text-error border border-error/20",
    neutral: "bg-surface-container text-on-surface-variant border border-outline-variant/80"
  };
  return (
    <span className={cn("inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap tracking-[0.02em]", variants[variant], className)}>
      {children}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = 'primary', size = 'md', className, loading, disabled, ...props },
  ref,
) {
  const variants = {
    primary: "bg-ink text-white hover:bg-[#1b4139] shadow-[0_18px_38px_rgba(21,52,46,0.18)] border border-ink/10",
    secondary: "bg-primary text-carbon hover:bg-[#c3fb7c] shadow-[0_16px_35px_rgba(182,243,106,0.22)] border border-primary/30",
    outline: "bg-white/70 text-on-surface border border-outline-variant/80 hover:bg-white shadow-[0_12px_28px_rgba(21,33,28,0.06)]",
    ghost: "bg-transparent text-secondary hover:text-on-surface hover:bg-white/70"
  };
  const sizes = {
    sm: "px-3.5 py-2 text-xs",
    md: "px-4.5 py-2.5 text-sm font-semibold",
    lg: "px-6 py-3.5 text-base font-bold"
  };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-full transition-[color,background-color,transform,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      ) : null}
      <span className={cn(loading && "opacity-80")}>{children}</span>
    </button>
  );
});
