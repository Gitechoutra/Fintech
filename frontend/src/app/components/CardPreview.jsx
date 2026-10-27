import { Nfc } from "lucide-react";

/** Network mark. Mastercard's interlocking circles use the network's own colours;
 *  others are typeset — no bank or network logos are implied beyond the network name. */
export function NetworkMark({ network, className = "" }) {
  if (network === "MASTERCARD") {
    return (
      <span className={`inline-flex items-center ${className}`} aria-label="Mastercard" role="img">
        <span className="w-7 h-7 rounded-full bg-mc-red/95" />
        <span className="w-7 h-7 rounded-full bg-mc-orange/90 -ml-3 mix-blend-normal" />
      </span>
    );
  }
  const text = { VISA: "VISA", RUPAY: "RuPay", AMEX: "AMEX" }[network];
  return text ? <span className={`font-extrabold italic tracking-wide text-lg ${className}`}>{text}</span> : null;
}

/** Card preview in brand colours. Only ever shows the last 4 digits. */
export function CardPreview({ last4, network, name, expiry, issuer, className = "" }) {
  return (
    <div className={`relative w-full max-w-[360px] aspect-[1.586] rounded-[22px] p-5 sm:p-6 overflow-hidden text-white
      bg-[linear-gradient(135deg,#023D2E_0%,#003A2D_45%,#0A0F0D_100%)] shadow-[0_24px_48px_-20px_rgb(0_58_45/0.6)] ${className}`}
      role="img" aria-label={`Card ending ${last4 || "unknown"}${network ? `, ${network}` : ""}`}>
      <div aria-hidden className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-mint-500/20 blur-2xl" />
      <div aria-hidden className="absolute right-6 bottom-0 w-40 h-40 rounded-full border border-mint-400/15" />
      <div className="relative h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-mint-200/80">{issuer || "Payment card"}</p>
          </div>
          <Nfc className="w-6 h-6 text-mint-200/70" aria-hidden />
        </div>
        <div aria-hidden className="w-11 h-8 rounded-md bg-[linear-gradient(135deg,#F2DFA8,#C9B37A_55%,#9C8650)] opacity-95" />
        <p className="font-mono text-[17px] sm:text-xl tracking-[0.14em] tabular">•••• •••• •••• {last4 || "••••"}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-mint-200/70">Card holder</p>
            <p className="text-sm font-semibold truncate uppercase">{name || "Your name"}</p>
          </div>
          {expiry && (
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-widest text-mint-200/70">Expires</p>
              <p className="text-sm font-semibold tabular">{expiry}</p>
            </div>
          )}
          <NetworkMark network={network} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
