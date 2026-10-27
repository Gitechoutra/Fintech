import { ShieldCheck } from "lucide-react";
import { fmtDate } from "../utils/format";
import { BankLogo } from "./BankLogo";
import { CardPreview } from "./CardPreview";

/** A linked credit card: card visual + provider + how it was verified. */
export function LinkedCardTile({ card, holder }) {
  return (
    <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
      <CardPreview last4={card.last4} name={holder} issuer={card.provider.card_product_name || card.provider.name}
        brand={card.provider.brand_color} />
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <BankLogo provider={card.provider} />
          <div className="min-w-0">
            <p className="font-bold text-fg truncate">{card.provider.name}</p>
            <p className="text-sm text-muted tabular">{card.masked_number}</p>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-mint-600 shrink-0" aria-hidden />{card.verification_label}
        </p>
        <p className="text-xs text-subtle">Linked {fmtDate(card.verified_at)}</p>
      </div>
    </div>
  );
}
