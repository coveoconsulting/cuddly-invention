type LogoProps = {
  className?: string;
};

export function Logo({ className }: LogoProps) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <img
        src="/logo.png"
        alt="Coveo consulting"
        className="absolute inset-0 h-full w-full"
        style={{ objectFit: "cover", objectPosition: "center" }}
        loading="eager"
      />
    </div>
  );
}
