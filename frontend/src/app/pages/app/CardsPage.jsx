import { useCallback, useEffect, useState } from "react";
import { CreditCard, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BankLogo } from "../../components/BankLogo";
import { CardLinker } from "../../components/CardLinker";
import { CardPreview } from "../../components/CardPreview";
import { fmtDate } from "../../utils/format";
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, ModalShell, Skeleton, useToast } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";

/** Cards: linked credit cards and their management (link, make primary, remove). */
export function CardsPage() {
  const { api, user } = useAuth();
  const { version } = useApp();
  const toast = useToast();
  const [cards, setCards] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const r = await api("/cards");
    if (r.ok) { setCards(r.data.cards); setError(""); } else setError(r.message);
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const makePrimary = async (c) => {
    setBusy(c.card_id);
    const r = await api(`/cards/${c.card_id}/primary`, { method: "POST" });
    setBusy(null);
    if (r.ok) { toast("success", `${c.provider.short_name} ${c.masked_number} is now your primary card.`); load(); }
    else toast("error", r.message);
  };

  const remove = async () => {
    setBusy(removing.card_id);
    const r = await api(`/cards/${removing.card_id}`, { method: "DELETE" });
    setBusy(null);
    setRemoving(null);
    if (r.ok) { toast("success", "Card removed."); load(); } else toast("error", r.message);
  };

  const primary = cards?.find((c) => c.is_primary) || cards?.[0];

  return (
    <>
      <PageHeader back={{ to: "/dashboard", label: "Home" }} title="Cards" text="Credit cards linked to your account. Your primary card is preselected when you pay."
        action={cards?.length > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Link card</Button>} />

      {error ? <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{error}</Banner>
        : cards === null ? <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-6"><Skeleton className="h-60" /><Skeleton className="h-60" /></div>
        : cards.length === 0 ? (
          <EmptyState icon={CreditCard} title="No linked cards" text="Link a credit card from your bank or Bajaj Finance to pay EMIs."
            action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Link a card</Button>} />
        ) : (
          <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
            <div className="space-y-4">
              <CardPreview last4={primary.last4} name={user.full_name} issuer={primary.provider.card_product_name || primary.provider.name} />
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Primary card</p>
                <p className="font-bold text-fg mt-1">{primary.provider.name} <span className="tabular text-muted font-medium">{primary.masked_number}</span></p>
                <p className="flex items-start gap-1.5 text-sm text-muted mt-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-mint-600 shrink-0" aria-hidden />{primary.verification_label}
                </p>
              </Card>
            </div>
            <Card className="p-2 sm:p-3">
              <ul className="divide-y divide-line">
                {cards.map((c) => (
                  <li key={c.card_id} className="flex flex-wrap items-center gap-3 p-3">
                    <BankLogo provider={c.provider} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-fg truncate">{c.provider.name}
                        <span className="text-muted font-normal tabular ml-2">{c.masked_number}</span></span>
                      <span className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-muted">
                        {c.is_primary && <Badge tone="gold" icon={Star}>Primary</Badge>}
                        {c.provider.card_product_name && <span>{c.provider.card_product_name} ·</span>}
                        Linked {fmtDate(c.verified_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 ml-auto">
                      {!c.is_primary && (
                        <Button size="sm" variant="ghost" onClick={() => makePrimary(c)} loading={busy === c.card_id}>Make primary</Button>
                      )}
                      <button type="button" onClick={() => setRemoving(c)} aria-label={`Remove ${c.provider.short_name} card ${c.masked_number}`}
                        className="p-2 rounded-xl text-muted hover:text-danger-fg hover:bg-danger-soft">
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

      {adding && (
        <ModalShell title="Link a credit card" subtitle="Choose your bank or card provider." wide onClose={() => setAdding(false)}>
          <CardLinker onLinked={() => { setAdding(false); toast("success", "Card linked."); load(); }} />
        </ModalShell>
      )}
      {removing && (
        <ConfirmDialog title="Remove this card?" danger busy={busy === removing.card_id} confirmLabel="Remove card"
          message={`Your ${removing.provider.name} card ${removing.masked_number} will be removed from your account.`}
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </>
  );
}
