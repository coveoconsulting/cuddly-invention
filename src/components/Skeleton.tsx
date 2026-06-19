import { cn } from "../lib/utils";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-pulse rounded-lg bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container bg-[length:200%_100%]",
        "[animation:shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
      style={style}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3"
          style={{ width: index === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-sm",
        className,
      )}
    >
      <Skeleton className="h-4 w-1/2" />
      <SkeletonText className="mt-3" lines={2} />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
