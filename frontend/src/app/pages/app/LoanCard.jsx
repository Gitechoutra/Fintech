import { useState } from "react";
import { CalendarClock, Clock, Landmark, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LOAN_STATUS, daysUntil, fmtDate, fmtDateTime, fmtINR } from "../../utils/format";
import { dueLabel, repaymentProgress } from "../../utils/loans";
import { Button, useToast } from "../../components/ui";

const STATUS_DOT = { success: "bg-mint-500", danger: "bg-danger", neutral: "bg-neutral-400" };

/** One loan: amount, outstanding, EMI, due date, repayment progress and Pay Now.
 *  Every figure is the lender's; "—" means the lender did not share it. */
export function LoanCard({ loan, onPay, onUpdated, paymentsReady }) {
  const { api } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const st = LOAN_STATUS[loan.loan_status];
  const days = daysUntil(loan.next_due_date);
  const progress = repaymentProgress(loan);

  const refresh = async () => {
    setRefreshing(true);
    const r = await api(`/loans/${loan.loan_id}/refresh`, { method: "POST" });
    setRefreshing(false);
    if (r.ok) { onUpdated?.(r.data.loan); toast("success", "Loan details updated from your lender."); }
    else toast("error", r.message);
  };

  return (
    <article aria-label={`${loan.product_name || "Loan"} ${loan.masked_number}`}
      className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(140deg,#0A0F0D_0%,#14211D_55%,#023D2E_100%)] text-white p-5 sm:p-6
        shadow-[0_24px_50px_-28px_rgb(0_58_45/0.85)] flex flex-col">
      <div aria-hidden className="absolute -right-20 -top-24 w-64 h-64 rounded-full bg-mint-500/15 blur-3xl" />
      <div className="relative flex flex-col flex-1">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center shrink-0">
              <Landmark className="w-[18px] h-[18px] text-mint-400" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-bold truncate">{loan.product_name || "Loan"}</p>
              <p className="text-xs text-neutral-400 truncate">{loan.provider_name} · <span className="tabular">{loan.masked_number}</span></p>
            </div>
          </div>
          {st && (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white/[0.07] border border-white/10 text-xs font-semibold shrink-0">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[st.tone]}`} aria-hidden />{st.label}
            </span>
          )}
        </header>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-neutral-400">Outstanding</p>
          <p className="text-3xl sm:text-[34px] font-extrabold tracking-tight tabular mt-1">{fmtINR(loan.payable_balance ?? loan.outstanding_balance)}</p>
          {Number(loan.paid_in_app_since_update) > 0 && (
            <p className="text-xs text-mint-300 mt-1 tabular">{fmtINR(loan.paid_in_app_since_update)} paid here since the lender's last update</p>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-2 mt-5">
          <Stat label="Loan amount" value={fmtINR(loan.sanctioned_amount, { decimals: 0 })} />
          <Stat icon={Wallet} label="EMI" value={fmtINR(loan.emi_amount)} />
          <Stat icon={CalendarClock} label="Due date" value={fmtDate(loan.next_due_date)}
            sub={dueLabel(days)} subCls={days !== null && days < 0 ? "text-red-300" : days !== null && days <= 5 ? "text-gold-100" : "text-neutral-400"} />
        </dl>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Repayment progress</span>
            <span className="font-semibold tabular">{progress === null ? "Not shared" : `${Math.round(progress)}% repaid`}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Repayment progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === null ? undefined : Math.round(progress)}
            aria-valuetext={progress === null ? "Not shared by the lender" : `${Math.round(progress)} percent repaid`}>
            {progress !== null && (
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#009170,#00F5B8)] transition-[width] duration-700" style={{ width: `${progress}%` }} />
            )}
          </div>
        </div>

        {loan.open_payment_id && (
          <p className="mt-4 flex items-center gap-2 text-sm text-gold-100"><Clock className="w-4 h-4" aria-hidden />A payment is being confirmed.</p>
        )}

        <div className="mt-auto pt-6 flex items-center gap-2">
          <Button size="lg" onClick={() => onPay(loan)} className="flex-1 sm:flex-none sm:min-w-40">
            {loan.open_payment_id ? "View status" : "Pay now"}
          </Button>
          {loan.can_refresh && (
            <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh from lender"
              className="w-12 h-12 inline-flex items-center justify-center rounded-[var(--radius-control)] text-neutral-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            </button>
          )}
        </div>
        <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
          {loan.data_as_of ? <>Figures from {loan.provider_name} · updated {fmtDateTime(loan.data_as_of)}</>
            : <>{loan.verification_label}. {loan.provider_name} does not share balance or EMI details through this verification.</>}
          {!paymentsReady && " Payments are not configured yet."}
        </p>
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value, sub, subCls }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] border border-white/[0.08] p-3 min-w-0">
      <dt className="flex items-center gap-1 text-[11px] text-neutral-400 truncate">{Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden />}{label}</dt>
      <dd className="font-bold tabular mt-1 text-sm truncate">{value}</dd>
      {sub && <dd className={`text-[11px] mt-0.5 truncate ${subCls}`}>{sub}</dd>}
    </div>
  );
}
