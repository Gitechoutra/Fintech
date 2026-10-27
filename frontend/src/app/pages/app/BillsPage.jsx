import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Info, Landmark } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { PAYMENT_STATUS, fmtDate, fmtINR } from "../../utils/format";
import { classifyDues, dueLabel } from "../../utils/loans";
import { Badge, Banner, Button, Card, EmptyState, Skeleton } from "../../components/ui";
import { useApp } from "./AppContext";
import { PageHeader } from "./AppShell";
import { PaymentList } from "./PaymentList";
import { Segmented } from "./Segmented";

/**
 * Bills: EMI dues built from the lender's figures, plus payments.
 *   Pending  — overdue / due today, and payments still being confirmed
 *   Upcoming — EMIs due later (and loans whose lender does not share a due date)
 *   Paid     — payments confirmed by Razorpay
 */
export function BillsPage() {
  const { api } = useAuth();
  const { openPay, version } = useApp();
  const [tab, setTab] = useState("pending");
  const [loans, setLoans] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [l, o] = await Promise.all([api("/loans"), api("/payments?status=OPEN&per_page=50")]);
    if (l.ok) { setLoans(l.data.loans); setError(""); } else setError(l.message);
    setOpen(o.ok ? o.data.payments : []);
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const dues = loans ? classifyDues(loans) : null;
  const pendingCount = dues ? dues.pending.length + (open?.length || 0) : undefined;
  const upcomingCount = dues ? dues.upcoming.length + dues.undated.length : undefined;

  return (
    <>
      <PageHeader back={{ to: "/dashboard", label: "Home" }} title="Bills" text="Your EMI dues and payments in one place." />
      <div className="mb-5">
        <Segmented id="bills" label="Bills" value={tab} onChange={setTab} tabs={[
          { key: "pending", label: "Pending", count: pendingCount },
          { key: "upcoming", label: "Upcoming", count: upcomingCount },
          { key: "paid", label: "Paid" },
        ]} />
      </div>

      {error ? <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{error}</Banner> : (
        <Card className="p-4 sm:p-6">
          {tab === "paid" ? (
            <PaymentList status="SUCCESS" version={version} emptyTitle="No paid bills yet"
              emptyText="EMIs you pay here appear once Razorpay confirms them." />
          ) : !dues || open === null ? (
            <div className="space-y-2.5">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : tab === "pending" ? (
            dues.pending.length === 0 && open.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing pending" text="No overdue EMIs and no payments waiting for confirmation." />
            ) : (
              <ul className="divide-y divide-line">
                {open.map((p) => {
                  const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.CREATED;
                  return (
                    <BillRow key={p.payment_id} icon={Clock} tone="warning"
                      title={`${fmtINR(p.total)} · ${p.loan_label}`}
                      sub={`Started ${fmtDate(p.created_at)} — waiting for confirmation from the payment provider`}
                      badge={<Badge tone={st.tone}>{st.label}</Badge>} />
                  );
                })}
                {dues.pending.map(({ loan, days }) => (
                  <BillRow key={loan.loan_id} icon={CalendarClock} tone="danger"
                    title={`${loan.product_name || "Loan"} ${loan.masked_number}`}
                    sub={`${loan.emi_amount ? `EMI ${fmtINR(loan.emi_amount)} · ` : ""}${loan.next_due_date ? `${fmtDate(loan.next_due_date)} · ${dueLabel(days)}` : "Marked overdue by your lender"}`}
                    badge={<Badge tone="danger">{days !== null && days === 0 ? "Due today" : "Overdue"}</Badge>}
                    action={<Button size="sm" onClick={() => openPay(loan)}>{loan.open_payment_id ? "Status" : "Pay now"}</Button>} />
                ))}
              </ul>
            )
          ) : (
            dues.upcoming.length === 0 && dues.undated.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No upcoming EMIs" text="Link a loan to see its upcoming EMIs." />
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {dues.upcoming.map(({ loan, days }) => (
                    <BillRow key={loan.loan_id} icon={CalendarClock}
                      title={`${loan.product_name || "Loan"} ${loan.masked_number}`}
                      sub={`${loan.emi_amount ? `EMI ${fmtINR(loan.emi_amount)} · ` : ""}${fmtDate(loan.next_due_date)} · ${dueLabel(days)}`}
                      badge={<Badge tone={days <= 5 ? "warning" : "neutral"}>{days <= 5 ? "Due soon" : "Scheduled"}</Badge>}
                      action={<Button size="sm" variant={days <= 5 ? "primary" : "secondary"} onClick={() => openPay(loan)}>Pay now</Button>} />
                  ))}
                  {dues.undated.map(({ loan }) => (
                    <BillRow key={loan.loan_id} icon={Landmark}
                      title={`${loan.product_name || "Loan"} ${loan.masked_number}`}
                      sub={`${loan.provider_name} does not share the due date or EMI amount through this verification`}
                      badge={<Badge>Date not shared</Badge>}
                      action={<Button size="sm" variant="secondary" onClick={() => openPay(loan)}>Pay now</Button>} />
                  ))}
                </ul>
                {dues.undated.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-muted mt-4">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                    Check the due date and EMI in your lender's app; you can still pay any amount here.
                  </p>
                )}
              </>
            )
          )}
        </Card>
      )}
    </>
  );
}

function BillRow({ icon: Icon, tone, title, sub, badge, action }) {
  const iconCls = tone === "danger" ? "bg-danger-soft text-danger-fg" : tone === "warning" ? "bg-warning-soft text-warning-fg" : "bg-accent-soft text-accent";
  return (
    <li className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-3.5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg truncate">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className="flex items-center gap-2 ml-auto">{badge}{action}</span>
    </li>
  );
}
