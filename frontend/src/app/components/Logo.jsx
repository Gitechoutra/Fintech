/** LendEase mark: an "L" rail carrying a rising repayment line. */
export function LogoMark({ className = "w-9 h-9" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="le-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1FF7C0" />
          <stop offset="1" stopColor="#009170" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0A0F0D" />
      <path d="M20 14v30a6 6 0 0 0 6 6h18" fill="none" stroke="url(#le-g)" strokeWidth="7" strokeLinecap="round" />
      <path d="M30 36l7-8 5 5 8-10" fill="none" stroke="#00F5B8" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "", size = "md", inverse = false }) {
  const mark = size === "sm" ? "w-8 h-8" : "w-9 h-9";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={mark} />
      <span className={`font-extrabold tracking-tight ${inverse ? "text-white" : "text-fg"} ${size === "sm" ? "text-lg" : "text-xl"}`}>
        Lend<span className={inverse ? "text-mint-500" : "text-mint-600"}>Ease</span>
      </span>
    </span>
  );
}
