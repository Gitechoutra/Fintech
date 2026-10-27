import { useEffect, useState } from "react";
import { CreditCard, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BankLogo } from "../../components/BankLogo";
import { CardLinker } from "../../components/CardLinker";
import { CardPreview } from "../../components/CardPreview";
import { fmtDate } from "../../utils/format";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ModalShell, Skeleton, useToast } from "../../components/ui";

/** The user's linked credit cards (from /cards). `featured` shows the primary card large. */
export function LinkedCards({ featured = false }) {
  const { api, user } = useAuth();
  const toast = useToast();
  const [cards, setCards] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api("/cards");
    if (r.ok) { setCards(r.data.cards); setError(""); } else setError(r.message);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    setBusy(true);
    const r = await api(`/cards/${removing.card_id}`, { method: "DELETE" });
    setBusy(false);
    setRemoving(null);
    if (r.ok) { toast("success", "Card removed."); load(); } else toast("error", r.message);
  };

  const primary = cards?.find((c) => c.is_primary) || cards?.[0];

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-fg">Linked cards</h2>
        {cards?.length > 0 && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Link card</Button>}
      </div>
      {error ? <p className="text-sm text-danger-fg">{error}</p>
        : cards === null ? <Skeleton className={featured ? "h-56" : "h-16"} />
        : cards.length === 0 ? (
          <EmptyState icon={CreditCard} title="No linked cards" text="Link a credit card from your bank or Bajaj Finance."
            action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Link a card</Button>} />
        ) : (
          <>
            {featured && primary && (
              <div className="mb-5 flex flex-col md:flex-row md:items-center gap-5">
                <CardPreview last4={primary.last4} name={user.full_name} issuer={primary.provider.card_product_name || primary.provider.name} />
                <p className="flex items-start gap-1.5 text-sm text-muted max-w-xs">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-mint-600 shrink-0" aria-hidden />{primary.verification_label}
                </p>
              </div>
            )}
            <ul className="space-y-2.5">
              {cards.map((c) => (
                <li key={c.card_id} className="flex items-center gap-3 p-3 rounded-2xl border border-line">
                  <BankLogo provider={c.provider} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg truncate">{c.provider.short_name}
                      <span className="text-muted font-normal tabular ml-2">{c.masked_number}</span></span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-muted">
                      {c.is_primary && <Badge tone="gold">Primary</Badge>}
                      Linked {fmtDate(c.verified_at)}
                    </span>
                  </span>
                  <button type="button" onClick={() => setRemoving(c)} aria-label={`Remove ${c.provider.short_name} card ${c.masked_number}`}
                    className="p-2 rounded-xl text-muted hover:text-danger-fg hover:bg-danger-soft">
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

      {adding && (
        <ModalShell title="Link a credit card" subtitle="Choose your bank or card provider." wide onClose={() => setAdding(false)}>
          <CardLinker onLinked={() => { setAdding(false); toast("success", "Card linked."); load(); }} />
        </ModalShell>
      )}
      {removing && (
        <ConfirmDialog title="Remove this card?" danger busy={busy} confirmLabel="Remove card"
          message={`Your ${removing.provider.name} card ${removing.masked_number} will be removed from your account.`}
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </Card>
  );
}
