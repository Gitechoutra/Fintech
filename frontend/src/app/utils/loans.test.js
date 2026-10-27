import { describe, expect, it } from "vitest";
import { classifyDues, emiStatus, repaymentProgress, summarize } from "./loans";

const today = new Date(2026, 9, 27);
const a = { loan_id: "a", sanctioned_amount: "500000.00", outstanding_balance: "300000.00", payable_balance: "300000.00",
  emi_amount: "15240.00", next_due_date: "2026-11-05", loan_status: "ACTIVE" };
const b = { loan_id: "b", sanctioned_amount: null, outstanding_balance: null, payable_balance: null,
  emi_amount: null, next_due_date: null, loan_status: null };
const c = { ...a, loan_id: "c", next_due_date: "2026-10-20", loan_status: "OVERDUE", emi_amount: "4890.00" };

describe("loan figures use only reported values", () => {
  it("repayment progress", () => {
    expect(repaymentProgress(a)).toBe(40);
    expect(repaymentProgress(b)).toBeNull();
  });

  it("summary totals known figures and counts unreported loans", () => {
    const s = summarize([a, b], today);
    expect(s.totalOutstanding).toBe("300000.00");
    expect(s.unreported).toBe(1);
    expect(s.nextDueDate).toBe("2026-11-05");
    expect(s.nextDueInDays).toBe(9);
    expect(s.upcomingEmi).toBe("15240.00");
  });

  it("summary with nothing reported", () => {
    const s = summarize([b], today);
    expect(s.totalOutstanding).toBeNull();
    expect(s.nextDueDate).toBeNull();
  });

  it("classifies dues for Bills", () => {
    const { pending, upcoming, undated } = classifyDues([a, b, c], today);
    expect(pending.map((x) => x.loan.loan_id)).toEqual(["c"]);
    expect(upcoming.map((x) => x.loan.loan_id)).toEqual(["a"]);
    expect(undated.map((x) => x.loan.loan_id)).toEqual(["b"]);
  });
});

describe("EMI status", () => {
  it("prefers server facts in order", () => {
    expect(emiStatus({ ...a, open_payment_id: "x" }, today).label).toBe("Payment in progress");
    expect(emiStatus({ ...a, paid_in_app_since_update: "15240.00" }, today).label).toBe("Paid");
    expect(emiStatus(c, today).label).toBe("Overdue");
    expect(emiStatus({ ...a, next_due_date: "2026-10-30" }, today).label).toBe("Due soon");
    expect(emiStatus(a, today).label).toBe("Upcoming");
    expect(emiStatus(b, today).label).toBe("Due date not shared");
  });
});
