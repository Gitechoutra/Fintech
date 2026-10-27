import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell, CreditCard, Fingerprint, History, KeyRound, Landmark, Plus, ReceiptText, ScanLine, Search, Smartphone, UserRound, X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BankLogo } from "../../components/BankLogo";
import { PaymentReceipt } from "../../components/PaymentFlow";
import { PAYMENT_STATUS, fmtDate, fmtINR } from "../../utils/format";
import { Badge, Card, EmptyState, ModalShell, Skeleton } from "../../components/ui";
import { PageHeader } from "./AppShell";

/** App destinations and actions you can search for. */
const ACTIONS = [
  { label: "EMIs", keywords: "pay emi emis due bajaj payment", to: "/dashboard/emis", icon: Landmark },
  { label: "Loans", keywords: "loans loan bajaj outstanding details", to: "/dashboard/loans", icon: Landmark },
  { label: "Scan & pay", keywords: "scan qr upi scanner pay", to: "/dashboard/scanner", icon: ScanLine },
  { label: "Bills", keywords: "bills due pending upcoming paid emi", to: "/dashboard/bills", icon: ReceiptText },
  { label: "Linked cards", keywords: "cards credit card primary remove", to: "/dashboard/cards", icon: CreditCard },
  { label: "Link a credit card", keywords: "add link new card bank", to: "/dashboard/cards", icon: Plus },
  { label: "Payment history", keywords: "history transactions receipts payments", to: "/dashboard/history", icon: History },
  { label: "Edit profile", keywords: "profile name email account", to: "/dashboard/settings#profile", icon: UserRound },
  { label: "Change MPIN", keywords: "mpin pin security password change", to: "/dashboard/settings#security", icon: KeyRound },
  { label: "Biometric unlock", keywords: "biometrics fingerprint face id security", to: "/dashboard/settings#security", icon: Fingerprint },
  { label: "Signed-in devices", keywords: "devices sessions sign out logout security", to: "/dashboard/settings#security", icon: Smartphone },
  { label: "Notifications", keywords: "notifications alerts email", to: "/dashboard/settings#notifications", icon: Bell },
];

const matches = (text, q) => q.split(/\s+/).every((t) => text.toLowerCase().includes(t));

/** Search: actions, loans, cards, payments and scanned payees. */
export function SearchPage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    inputRef.current?.focus();
    Promise.all([api("/loans"), api("/cards"), api("/payments?per_page=50"), api("/scan/payments?limit=50")]).then(([l, c, p, s]) =>
      setData({ loans: l.ok ? l.data.loans : [], cards: c.ok ? c.data.cards : [],
                payments: p.ok ? p.data.payments : [], payees: s.ok ? s.data.payments : [] }));
  }, [api]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query || !data) return null;
    return {
      actions: ACTIONS.filter((a) => matches(`${a.label} ${a.keywords}`, query)),
      loans: data.loans.filter((l) => matches(`${l.product_name} ${l.provider_name} ${l.masked_number} loan emi`, query)),
      cards: data.cards.filter((c) => matches(`${c.provider.name} ${c.provider.short_name} ${c.last4} ${c.provider.card_product_name || ""} card`, query)),
      payments: data.payments.filter((p) => matches(`${p.receipt_number} ${p.loan_label} ${p.total} ${p.status} ${PAYMENT_STATUS[p.status]?.label || ""} ${p.card_label || ""} payment`, query)),
      payees: data.payees.filter((r) => matches(`${r.payee_name || ""} ${r.payee_vpa} ${r.amount || ""}`, query)),
    };
  }, [query, data]);
  const total = results ? Object.values(results).reduce((n, r) => n + r.length, 0) : 0;

  return (
    <>
      <PageHeader title="Search" text="Find loans, cards, payments, payees and settings." />
      <div className="relative mb-6 max-w-2xl">
        <Search className="w-5 h-5 text-subtle absolute left-4 top-1/2 -translate-y-1/2" aria-hidden />
        <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
          placeholder="Search e.g. HDFC, receipt number, MPIN, bills"
          className="w-full h-14 pl-12 pr-12 rounded-2xl bg-surface border border-line-strong text-[15px] text-fg placeholder:text-subtle
            focus:outline-none focus:border-mint-600 focus:ring-4 focus:ring-mint-500/15 shadow-[var(--shadow-card)]" />
        {q && (
          <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-muted hover:text-fg hover:bg-surface-2">
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {!query ? (
        <section aria-label="Suggestions">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Quick links</h2>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.slice(0, 8).map((a) => (
              <button key={a.label} type="button" onClick={() => navigate(a.to)}
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full border border-line bg-surface text-sm font-semibold text-fg hover:border-mint-600/50 hover:bg-accent-soft">
                <a.icon className="w-4 h-4 text-accent" aria-hidden />{a.label}
              </button>
            ))}
          </div>
        </section>
      ) : !data ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : total === 0 ? (
        <EmptyState icon={Search} title={`No results for “${q.trim()}”`} text="Try a bank name, the last 4 digits of a card, a receipt number or an amount." />
      ) : (
        <div className="space-y-5" aria-live="polite">
          <Group title="Actions" items={results.actions} render={(a) => (
            <Row key={a.label} onClick={() => navigate(a.to)} icon={<a.icon className="w-[18px] h-[18px] text-accent" aria-hidden />} title={a.label} />
          )} />
          <Group title="Loans" items={results.loans} render={(l) => (
            <Row key={l.loan_id} onClick={() => navigate(`/dashboard/loans/${l.loan_id}`)}
              icon={<Landmark className="w-[18px] h-[18px] text-accent" aria-hidden />}
              title={`${l.product_name || "Loan"} ${l.masked_number}`} sub={l.provider_name} />
          )} />
          <Group title="Cards" items={results.cards} render={(c) => (
            <Row key={c.card_id} onClick={() => navigate("/dashboard/cards")} icon={<BankLogo provider={c.provider} size="sm" />}
              title={`${c.provider.name} ${c.masked_number}`} sub={c.is_primary ? "Primary card" : "Linked card"} />
          )} />
          <Group title="Payments" items={results.payments} render={(p) => {
            const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
            return (
              <Row key={p.payment_id} onClick={() => setReceipt(p)} icon={<ReceiptText className="w-[18px] h-[18px] text-accent" aria-hidden />}
                title={`${fmtINR(p.total)} · ${p.loan_label}`} sub={`${fmtDate(p.created_at)} · ${p.receipt_number}`}
                right={<Badge tone={st.tone}>{st.label}</Badge>} />
            );
          }} />
          <Group title="Scanned payees" items={results.payees} render={(r) => (
            <Row key={r.id} onClick={() => navigate("/dashboard/history")} icon={<ScanLine className="w-[18px] h-[18px] text-accent" aria-hidden />}
              title={r.payee_name || r.payee_vpa} sub={r.payee_vpa} right={<span className="text-sm text-fg tabular">{r.amount ? fmtINR(r.amount) : "—"}</span>} />
          )} />
        </div>
      )}

      {receipt && (
        <ModalShell title="Payment details" onClose={() => setReceipt(null)}>
          <PaymentReceipt txn={receipt} />
        </ModalShell>
      )}
    </>
  );
}

function Group({ title, items, render }) {
  if (!items.length) return null;
  return (
    <Card className="p-2 sm:p-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted px-3 pt-2 pb-1">{title} <span className="tabular">· {items.length}</span></h2>
      <ul>{items.map(render)}</ul>
    </Card>
  );
}

function Row({ icon, title, sub, right, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-surface-2">
        <span className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg truncate">{title}</span>
          {sub && <span className="block text-xs text-muted truncate">{sub}</span>}
        </span>
        {right}
      </button>
    </li>
  );
}
