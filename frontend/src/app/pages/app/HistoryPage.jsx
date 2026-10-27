import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fmtDateTime, fmtINR } from "../../utils/format";
import { Badge, Banner, Card, EmptyState, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";
import { PaymentList } from "./PaymentList";
import { Segmented } from "./Segmented";

const FILTERS = [
  { key: "", label: "All" },
  { key: "SUCCESS", label: "Successful" },
  { key: "OPEN", label: "In progress" },
  { key: "FAILED", label: "Failed" },
];

/** History: every EMI payment (filterable) and every QR handed to a UPI app. */
export function HistoryPage() {
  const { version } = useApp();
  const [tab, setTab] = useState("payments");
  const [status, setStatus] = useState("");

  return (
    <>
      <PageHeader title="History" text="Your complete payment and transaction history." />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <Segmented id="history" label="History type" value={tab} onChange={setTab} tabs={[
          { key: "payments", label: "EMI payments" },
          { key: "scan", label: "Scan & pay" },
        ]} />
        {tab === "payments" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.key || "all"} type="button" onClick={() => setStatus(f.key)} aria-pressed={status === f.key}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors
                  ${status === f.key ? "bg-accent-soft border-mint-600/40 text-accent" : "border-line text-muted hover:text-fg"}`}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Card className="p-4 sm:p-6">
        {tab === "payments"
          ? <PaymentList key={status} status={status} version={version} pageSize={15}
              emptyTitle={status ? "No payments match this filter" : "No payments yet"}
              emptyText="Payments you make appear here with their confirmed status." />
          : <ScanHistory />}
      </Card>
    </>
  );
}

function ScanHistory() {
  const { api } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/scan/payments?limit=100").then((r) => { if (r.ok) setRows(r.data.payments); else setError(r.message); });
  }, [api]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (rows === null) return <div className="space-y-2.5">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (rows.length === 0) return <EmptyState icon={ScanLine} title="No scans yet" text="UPI codes you scan and open in your UPI app are listed here." />;
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <span className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0"><ScanLine className="w-[18px] h-[18px] text-accent" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg truncate">{r.payee_name || r.payee_vpa}</span>
              <span className="block text-xs text-muted font-mono truncate">{r.payee_vpa}</span>
            </span>
            <span className="text-right shrink-0">
              <span className="block text-sm font-semibold text-fg tabular">{r.amount ? fmtINR(r.amount) : "—"}</span>
              <span className="block text-[11px] text-subtle">{fmtDateTime(r.created_at)}</span>
            </span>
            <Badge className="hidden sm:inline-flex">Opened in UPI app</Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted mt-4">These payments are completed in your UPI app, so LendEase doesn't know their final status.</p>
    </>
  );
}
