import { useState } from "react";
import { CalendarClock, Clock, Landmark, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LOAN_STATUS, daysUntil, fmtDate, fmtDateTime, fmtINR } from "../../utils/format";
import { Button, useToast } from "../../components/ui";

const STATUS_DOT = { success: "bg-mint-500", danger: "bg-danger", neutral: "bg-neutral-400" };

/** Premium loan panel. Every figure is the lender's; "—" means not supplied. */
export function LoanPanel({ loan, onPay, onUpdated, paymentsReady }) {
  const { api } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const st = LOAN_STATUS[loan.loan_status];
  const days = daysUntil(loan.next_due_date);
  const dueText = days === null ? "" : days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `in ${days} day${days === 1 ? "" : "s"}`;

  const refresh = async () => {
    setRefreshing(true);
    const r = await api(`/loans/${loan.loan_id}/refresh`, { method: "POST" });
    setRefreshing(false);
    if (r.ok) { onUpdated(r.data.loan); toast("success", "Loan details updated from your lender."); }
    else toast("error", r.message);
  };

  return (
    <section aria-label={`${loan.product_name || "Loan"} ${loan.masked_number}`}
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(140deg,#0A0F0D_0%,#14211D_55%,#023D2E_100%)] text-white p-5 sm:p-7 shadow-[0_28px_60px_-28px_rgb(0_58_45/0.8)]">
      <div aria-hidden className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-mint-500/15 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-mint-400" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-bold truncate">{loan.product_name || "Loan"} <span className="text-neutral-400 font-medium tabular">{loan.masked_number}</span></p>
              <p className="text-sm text-neutral-400 truncate">{loan.provider_name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {st && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white/[0.07] border border-white/10 text-xs font-semibold">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[st.tone]}`} aria-hidden />{st.label}
              </span>
            )}
          </div>
        </div>

        <div className="mt-7">
          <p className="text-sm text-neutral-400">Outstanding balance</p>
          <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular mt-1">{fmtINR(loan.outstanding_balance)}</p>
          {Number(loan.paid_in_app_since_update) > 0 && (
            <p className="text-xs text-mint-300 mt-1.5 tabular">
              {fmtINR(loan.paid_in_app_since_update)} paid here since the lender's last update — payable now {fmtINR(loan.payable_balance)}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          <Stat icon={Wallet} label="Next EMI" value={fmtINR(loan.emi_amount)} />
          <Stat icon={CalendarClock} label="Due date" value={fmtDate(loan.next_due_date)}
            sub={dueText} subCls={days !== null && days < 0 ? "text-red-300" : days !== null && days <= 5 ? "text-gold-100" : "text-neutral-400"} />
          <Stat label="Sanctioned" value={fmtINR(loan.sanctioned_amount, { decimals: 0 })} className="hidden sm:block" />
        </dl>

        {loan.open_payment_id && (
          <p className="mt-5 flex items-center gap-2 text-sm text-gold-100">
            <Clock className="w-4 h-4" aria-hidden />A payment for this loan is being confirmed.
          </p>
        )}

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <Button size="lg" onClick={() => onPay(loan)} className="sm:min-w-48">
            {loan.open_payment_id ? "View payment status" : "Make a payment"}
          </Button>
          {loan.can_refresh && (
            <button type="button" onClick={refresh} disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 h-12 px-4 rounded-[var(--radius-control)] text-sm font-semibold text-neutral-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />Refresh from lender
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-4">
          {loan.data_as_of ? <>Figures from {loan.provider_name} · updated {fmtDateTime(loan.data_as_of)}</>
            : <>{loan.verification_label} · {loan.provider_name} does not share balance or EMI details through this verification</>}
          {!paymentsReady && " · Payments are not configured yet"}
        </p>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub, subCls, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white/[0.05] border border-white/[0.08] p-3.5 ${className}`}>
      <dt className="flex items-center gap-1.5 text-xs text-neutral-400">{Icon && <Icon className="w-3.5 h-3.5" aria-hidden />}{label}</dt>
      <dd className="font-bold tabular mt-1">{value}</dd>
      {sub && <dd className={`text-xs mt-0.5 ${subCls}`}>{sub}</dd>}
    </div>
  );
}
