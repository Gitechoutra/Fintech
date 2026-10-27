import { useState } from "react";

/** Logo from the provider master data (logo_url); falls back to a badge in the
 *  provider's brand colour when there is no logo file or it fails to load. */
export function BankLogo({ provider, size = "md" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "w-9 h-9 rounded-lg" : size === "lg" ? "w-14 h-14 rounded-2xl" : "w-11 h-11 rounded-xl";
  if (provider.logo_url && !failed) {
    return (
      <span className={`${box} bg-white border border-line flex items-center justify-center overflow-hidden shrink-0`}>
        <img src={provider.logo_url} alt="" className="w-[78%] h-[78%] object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  const initials = (provider.short_name || provider.name || "?").replace(/[^A-Za-z ]/g, "").split(" ")
    .filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span aria-hidden className={`${box} flex items-center justify-center shrink-0 text-white font-extrabold ${size === "sm" ? "text-xs" : "text-sm"}`}
      style={{ background: provider.brand_color || "#00614B" }}>
      {initials}
    </span>
  );
}
