import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { ChevronRight, ReceiptText } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PAYMENT_STATUS, fmtDate, fmtINR, titleCase } from "../../utils/format";
import { Badge, Banner, Button, Card, EmptyState, ModalShell, Skeleton } from "../../components/ui";
import { PaymentReceipt } from "../../components/PaymentFlow";

/** Real transactions from the server only. Table on wide screens, list on phones. */
export const PaymentHistory = forwardRef(function PaymentHistory(_, ref) {
  const { api } = useAuth();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) setError("");
    else setLoadingMore(true);
    const r = await api(`/payments?page=${p}&per_page=8`);
    setLoadingMore(false);
    if (!r.ok) { if (p === 1) { setItems(null); setError(r.message); } return; }
    setItems((cur) => (p === 1 ? r.data.payments : [...(cur || []), ...r.data.payments]));
    setPage(r.data.page); setPages(r.data.pages); setTotal(r.data.total);
  }, [api]);

  useEffect(() => { load(1); }, [load]);
  useImperativeHandle(ref, () => ({ reload: () => load(1) }), [load]);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-fg">Payment history</h2>
        {total > 0 && <span className="text-sm text-muted">{total} transaction{total === 1 ? "" : "s"}</span>}
      </div>

      {error ? (
        <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={() => load(1)}>Retry</Button>}>
          Couldn't load your payments. {error}
        </Banner>
      ) : items === null ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No payments yet" text="Payments you make here will appear with their confirmed status." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block -mx-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="font-semibold px-2 py-2">Date</th>
                  <th scope="col" className="font-semibold px-2 py-2">Reference</th>
                  <th scope="col" className="font-semibold px-2 py-2">Type</th>
                  <th scope="col" className="font-semibold px-2 py-2">Method</th>
                  <th scope="col" className="font-semibold px-2 py-2 text-right">Amount</th>
                  <th scope="col" className="font-semibold px-2 py-2">Status</th>
                  <th scope="col" className="px-2 py-2"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
                  return (
                    <tr key={p.payment_id} className="border-t border-line hover:bg-surface-2/60">
                      <td className="px-2 py-3 whitespace-nowrap text-fg">{fmtDate(p.created_at)}</td>
                      <td className="px-2 py-3 font-mono text-xs text-muted">{p.receipt_number}</td>
                      <td className="px-2 py-3 text-fg">{titleCase(p.payment_type)}</td>
                      <td className="px-2 py-3 text-muted">{p.payment_method ? p.payment_method.toUpperCase() : "—"}</td>
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

          {/* Mobile list */}
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
                      <span className="block text-xs text-muted mt-1 truncate">
                        {fmtDate(p.created_at)} · {titleCase(p.payment_type)}{p.payment_method ? ` · ${p.payment_method.toUpperCase()}` : ""}
                      </span>
                      <span className="block text-[11px] text-subtle font-mono mt-0.5 truncate">{p.receipt_number}</span>
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
        </>
      )}

      {selected && (
        <ModalShell title="Payment details" onClose={() => setSelected(null)}>
          <PaymentReceipt txn={selected} />
        </ModalShell>
      )}
    </Card>
  );
});
