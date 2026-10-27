/** Loads Razorpay's browser libraries on demand:
 *  - "checkout": Standard Checkout, the provider-hosted window where a card is entered (and saved);
 *  - "custom":   razorpay.js, which pays with a saved card token — the user only sees the bank's OTP.
 *  Both scripts assign window.Razorpay, so each constructor is captured as it loads. */
const SRC = {
  checkout: "https://checkout.razorpay.com/v1/checkout.js",
  custom: "https://checkout.razorpay.com/v1/razorpay.js",
};
const libs = {};
const pending = {};

/** Resolves to the Razorpay constructor for `kind`, or null if it could not be loaded. */
export function loadRazorpay(kind = "checkout") {
  if (libs[kind]) return Promise.resolve(libs[kind]);
  if (!pending[kind]) {
    pending[kind] = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = SRC[kind];
      s.async = true;
      s.onload = () => { libs[kind] = window.Razorpay || null; delete pending[kind]; resolve(libs[kind]); };
      s.onerror = () => { delete pending[kind]; s.remove(); resolve(null); };
      document.body.appendChild(s);
    });
  }
  return pending[kind];
}

/** Kept for callers that only need Standard Checkout. */
export const loadCheckout = () => loadRazorpay("checkout").then(Boolean);
