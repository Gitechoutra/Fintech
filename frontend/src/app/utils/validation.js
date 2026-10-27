/** Client-side validation — mirrors backend/portal/helpers/validators.py for UX.
 *  Advisory only: the server re-validates everything. Each fn returns an error
 *  string or "" when valid. */

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

export const cleanAmount = (v) => String(v ?? "").replace(/,/g, "").trim();
export const digitsOnly = (v) => String(v ?? "").replace(/\D/g, "");

export function validateMobile(v) {
  const d = String(v || "").replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? "" : "Enter a valid 10-digit Indian mobile number.";
}

export const validateOtp = (v) => (/^\d{6}$/.test(String(v || "")) ? "" : "Enter the 6-digit code.");

export function validateName(v) {
  const s = String(v || "").trim();
  if (!s) return "Full name is required.";
  return /^[A-Za-z][A-Za-z .'-]{1,99}$/.test(s) ? "" : "Use letters, spaces, dots, apostrophes or hyphens only.";
}

export function validateEmail(v) {
  const s = String(v || "").trim();
  if (!s) return "Email address is required.";
  return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s) && s.length <= 254
    ? "" : "Enter a valid email address.";
}

export function validateMpin(v) {
  const s = String(v || "");
  if (!/^\d{4}$/.test(s)) return "MPIN must be exactly 4 digits.";
  if (new Set(s).size === 1 || "0123456789".includes(s) || "9876543210".includes(s)) {
    return "Choose a less predictable MPIN (no repeated or sequential digits).";
  }
  return "";
}

export const normalizeIdentifier = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();

export function validateIdentifier(v, pattern, label) {
  const s = normalizeIdentifier(v);
  if (!s) return `${label} is required.`;
  try {
    return new RegExp(`^(?:${pattern})$`).test(s) && s.length <= 40 ? "" : `Enter a valid ${label.toLowerCase()}.`;
  } catch {
    return "";
  }
}

export function validatePaymentAmount(v, payable) {
  const s = cleanAmount(v);
  if (!s) return "Enter an amount.";
  if (!/^\d+(\.\d+)?$/.test(s)) return "Enter a positive amount in rupees.";
  if (!AMOUNT_RE.test(s)) return "Amount can have at most 2 decimal places.";
  const n = Number(s);
  if (n < 1) return "Minimum payment is ₹1.00.";
  if (payable !== null && payable !== undefined && n > Number(payable)) return "Amount cannot exceed the payable balance.";
  return "";
}

export const newIdempotencyKey = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9-]/g, "");
