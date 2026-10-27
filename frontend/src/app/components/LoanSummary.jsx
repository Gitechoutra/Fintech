import { Landmark, ShieldCheck } from "lucide-react";
import { LOAN_STATUS, fmtDate, fmtINR } from "../utils/format";
import { Badge } from "./ui";

/** Compact linked-loan summary (onboarding / lists). Figures the lender did not share show "—". */
export function LoanSummary({ loan }) {
  const st = LOAN_STATUS[loan.loan_status];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-accent" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-fg">{loan.product_name || "Loan"}</p>
            <span className="text-sm text-muted tabular">{loan.masked_number}</span>
          </div>
          <p className="text-sm text-muted truncate">{loan.provider_name}</p>
        </div>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>
      {loan.verification_label && (
        <p className="flex items-start gap-1.5 text-sm text-muted mt-3">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-mint-600 shrink-0" aria-hidden />{loan.verification_label}
        </p>
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-line">
        <div><dt className="text-xs text-muted">Outstanding</dt><dd className="font-bold text-fg tabular">{fmtINR(loan.outstanding_balance)}</dd></div>
        <div><dt className="text-xs text-muted">EMI</dt><dd className="font-semibold text-fg tabular">{fmtINR(loan.emi_amount)}</dd></div>
        <div><dt className="text-xs text-muted">Next due</dt><dd className="font-semibold text-fg">{fmtDate(loan.next_due_date)}</dd></div>
      </dl>
    </div>
  );
}
