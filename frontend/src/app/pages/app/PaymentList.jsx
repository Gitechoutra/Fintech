import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ReceiptText } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PAYMENT_STATUS, fmtDate, fmtINR, titleCase } from "../../utils/format";
import { Badge, Banner, Button, EmptyState, ModalShell, Skeleton } from "../../components/ui";
import { PaymentReceipt } from "../../components/PaymentFlow";

/** Server-side payment records (status filter + load more). Table on wide screens,
 *  list on phones; each row opens the receipt. */
export function PaymentList({ status = "", loanId = "", version = 0, pageSize = 10, emptyTitle = "No payments yet", emptyText }) {
  const { api } = useAuth();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) { setError(""); setItems(null); } else setLoadingMore(true);
    const q = new URLSearchParams({ page: String(p), per_page: String(pageSize), ...(status ? { status } : {}), ...(loanId ? { loan_id: loanId } : {}) });
    const r = await api(`/payments?${q}`);
    setLoadingMore(false);
    if (!r.ok) { if (p === 1) setError(r.message); return; }
    setItems((cur) => (p === 1 ? r.data.payments : [...(cur || []), ...r.data.payments]));
    setPage(r.data.page); setPages(r.data.pages);
  }, [api, status, loanId, pageSize]);
  useEffect(() => { load(1); }, [load, version]);

  if (error) return <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={() => load(1)}>Retry</Button>}>{error}</Banner>;
  if (items === null) return <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (items.length === 0) return <EmptyState icon={ReceiptText} title={emptyTitle} text={emptyText} />;

  return (
    <>
      <div className="hidden md:block overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Date", "Reference", "Loan", "Type", "Card / method", "Amount", "Status", ""].map((h, i) => (
                <th key={i} scope="col" className={`font-semibold px-2 py-2 ${h === "Amount" ? "text-right" : ""}`}>{h || <span className="sr-only">Details</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
              return (
                <tr key={p.payment_id} className="border-t border-line hover:bg-surface-2/60">
                  <td className="px-2 py-3 whitespace-nowrap text-fg">{fmtDate(p.created_at)}</td>
                  <td className="px-2 py-3 font-mono text-xs text-muted">{p.receipt_number}</td>
                  <td className="px-2 py-3 text-fg truncate max-w-44">{p.loan_label}</td>
                  <td className="px-2 py-3 text-fg">{titleCase(p.payment_type)}</td>
                  <td className="px-2 py-3 text-muted">{p.card_label || (p.payment_method ? p.payment_method.toUpperCase() : "—")}</td>
                  <td className="px-2 py-3 text-right font-semibold text-fg tabular whitespace-nowrap">{fmtINR(p.total)}</td>
                  <td className="px-2 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-2 py-3 text-right">
                    <button type="button" onClick={() => setSelected(p)} className="text-sm font-semibold text-accent hover:underline">View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden divide-y divide-line -mx-1">
        {items.map((p) => {
          const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
          return (
            <li key={p.payment_id}>
              <button type="button" onClick={() => setSelected(p)} className="w-full flex items-center gap-3 px-1 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-fg tabular">{fmtINR(p.total)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                  <span className="block text-xs text-muted mt-1 truncate">{fmtDate(p.created_at)} · {p.loan_label}</span>
                  <span className="block text-[11px] text-subtle font-mono mt-0.5 truncate">{p.receipt_number}{p.card_label ? ` · ${p.card_label}` : ""}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-subtle shrink-0" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {page < pages && (
        <div className="mt-4 text-center">
          <Button variant="secondary" size="sm" onClick={() => load(page + 1)} loading={loadingMore}>Load more</Button>
        </div>
      )}
      {selected && (
        <ModalShell title="Payment details" onClose={() => setSelected(null)}>
          <PaymentReceipt txn={selected} />
        </ModalShell>
      )}
    </>
  );
}
