/** Loads Razorpay Checkout (the provider-hosted payment window) on demand. */
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutPromise = null;

export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!checkoutPromise) {
    checkoutPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => { checkoutPromise = null; resolve(false); };
      document.body.appendChild(s);
    });
  }
  return checkoutPromise;
}
