/** Loan figures for the dashboard. Only values the lender reported are used —
 *  a missing figure is never estimated. Pure functions (unit-tested). */

import { daysUntil } from "./format";

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Repayment progress 0–100, or null when sanctioned/outstanding were not reported. */
export function repaymentProgress(loan) {
  const sanctioned = num(loan.sanctioned_amount);
  const outstanding = num(loan.payable_balance ?? loan.outstanding_balance);
  if (!sanctioned || sanctioned <= 0 || outstanding === null) return null;
  return Math.min(100, Math.max(0, ((sanctioned - outstanding) / sanctioned) * 100));
}

/** Summary across loans: totals of known figures plus how many loans lacked them. */
export function summarize(loans, today = new Date()) {
  let total = 0, reported = 0;
  for (const l of loans) {
    const o = num(l.payable_balance ?? l.outstanding_balance);
    if (o !== null) { total += o; reported += 1; }
  }
  const dated = loans.filter((l) => l.next_due_date)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const next = dated[0] || null;
  return {
    count: loans.length,
    totalOutstanding: reported ? total.toFixed(2) : null,
    unreported: loans.length - reported,
    nextLoan: next,
    nextDueDate: next?.next_due_date || null,
    nextDueInDays: next ? daysUntil(next.next_due_date, today) : null,
    upcomingEmi: next?.emi_amount ?? null,
  };
}

export const dueLabel = (days) => (days === null || days === undefined ? ""
  : days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue`
  : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`);

/** Bills view: loans needing payment now, loans due later, and loans without a reported date. */
export function classifyDues(loans, today = new Date()) {
  const pending = [], upcoming = [], undated = [];
  for (const l of loans) {
    const d = l.next_due_date ? daysUntil(l.next_due_date, today) : null;
    if (l.loan_status === "OVERDUE" || (d !== null && d <= 0)) pending.push({ loan: l, days: d });
    else if (d !== null) upcoming.push({ loan: l, days: d });
    else undated.push({ loan: l, days: null });
  }
  upcoming.sort((a, b) => a.days - b.days);
  return { pending, upcoming, undated };
}

/** EMI payment status for a loan, from server data only. */
export function emiStatus(loan, today = new Date()) {
  const days = loan.next_due_date ? daysUntil(loan.next_due_date, today) : null;
  if (loan.open_payment_id) return { label: "Payment in progress", tone: "warning" };
  if (Number(loan.paid_in_app_since_update) > 0) return { label: "Paid", tone: "success" };
  if (loan.loan_status === "OVERDUE" || (days !== null && days < 0)) return { label: "Overdue", tone: "danger" };
  if (days === 0) return { label: "Due today", tone: "danger" };
  if (days !== null) return days <= 5 ? { label: "Due soon", tone: "warning" } : { label: "Upcoming", tone: "neutral" };
  return { label: "Due date not shared", tone: "neutral" };
}
