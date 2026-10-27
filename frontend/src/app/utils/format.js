/** Display formatting (en-IN). Amounts arrive from the API as 2-dp strings; Number()
 *  is used for display only — never for arithmetic that is sent back. */

export const fmtINR = (v, { decimals = 2 } = {}) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
};

export const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const daysUntil = (iso, today = new Date()) => {
  if (!iso) return null;
  const a = new Date(`${iso}T00:00:00`);
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
};

export const titleCase = (s) => String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Payment status → label + tone. Tone drives colour; the label always carries the meaning too. */
export const PAYMENT_STATUS = {
  CREATED:   { label: "Awaiting payment", tone: "neutral" },
  PENDING:   { label: "Pending",          tone: "warning" },
  SUCCESS:   { label: "Successful",       tone: "success" },
  FAILED:    { label: "Failed",           tone: "danger" },
  CANCELLED: { label: "Cancelled",        tone: "neutral" },
};

export const LOAN_STATUS = {
  ACTIVE:  { label: "Active",  tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CLOSED:  { label: "Closed",  tone: "neutral" },
};

export const SETTLEMENT_LABEL = {
  NOT_STARTED: "Not started",
  NOT_CONFIGURED: "Lender not credited — settlement partner not configured (test mode)",
  PENDING: "Being credited to your lender",
  SETTLED: "Credited to your lender",
  FAILED: "Lender credit failed — contact support",
};
