import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ReceiptText, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PAYMENT_STATUS, SETTLEMENT_LABEL, fmtDate, fmtDateTime, fmtINR, titleCase } from "../utils/format";
import { loadRazorpay } from "../utils/razorpay";
import { cleanAmount, newIdempotencyKey, validatePaymentAmount } from "../utils/validation";
import { BankLogo } from "./BankLogo";
import { Badge, Banner, Button, Field, Row, inputCls } from "./ui";

/**
 * amount → review (server quote: fee + total) → pay → status. A linked card already saved
 * with Razorpay pays with its token (bank OTP only); otherwise Razorpay Checkout opens
 * once to enter and save it.
 * The status shown at the end is always the server's, which it gets from Razorpay
 * server-to-server — never from the checkout callback alone.
 */
export function PaymentFlow({ loan, payment, onFinished }) {
  const { api, user } = useAuth();
  const payable = loan.payable_balance;
  const emi = loan.emi_amount && (payable === null || Number(loan.emi_amount) <= Number(payable)) ? loan.emi_amount : null;
  const [step, setStep] = useState(loan.open_payment_id ? "status" : "amount");
  const [type, setType] = useState(emi ? "EMI" : "PART_PAYMENT");
  const [amount, setAmount] = useState(emi ? Number(emi).toFixed(2) : "");
  const [err, setErr] = useState("");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [txn, setTxn] = useState(null);
  const [notice, setNotice] = useState("");
  const [cards, setCards] = useState(null);
  const [cardId, setCardId] = useState("");
  const idemKey = useRef(null);
  const pollTimer = useRef(null);
  const finished = useRef(false);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  // The EMI is paid with one of the user's linked credit cards (primary first).
  useEffect(() => {
    api("/cards").then((r) => {
      const list = r.ok ? r.data.cards : [];
      setCards(list);
      setCardId((list.find((c) => c.is_primary) || list[0])?.card_id || "");
    });
  }, [api]);
  const card = cards?.find((c) => c.card_id === cardId);

  const poll = useCallback(async (paymentId, tries = 0) => {
    clearTimeout(pollTimer.current);
    const r = await api(`/payments/${paymentId}`);
    if (r.ok) setTxn(r.data.payment);
    const open = r.ok && ["CREATED", "PENDING"].includes(r.data.payment.status);
    if (open && tries < 40) pollTimer.current = setTimeout(() => poll(paymentId, tries + 1), 3000);
    if (r.ok && !open && !finished.current) { finished.current = true; onFinished?.(r.data.payment); }
  }, [api, onFinished]);

  // A payment for this loan is already in flight: show it instead of starting another.
  useEffect(() => { if (loan.open_payment_id) poll(loan.open_payment_id); }, [loan.open_payment_id, poll]);

  const review = async () => {
    const e = validatePaymentAmount(amount, payable) || (!card ? "Choose the credit card to pay with." : "");
    setErr(e);
    if (e || busy) return;
    setBusy(true);
    const r = await api("/payments/quote", { method: "POST", body: { loan_id: loan.loan_id, amount: cleanAmount(amount), payment_type: type } });
    setBusy(false);
    if (!r.ok) { setErr(r.errors?.amount || r.message); return; }
    setQuote(r.data);
    loadRazorpay(card.saved_for_payments ? "custom" : "checkout");
    idemKey.current = newIdempotencyKey();       // one key per confirmation → retries reuse it
    setStep("review");
  };

  const pay = async () => {
    if (busy) return;
    setBusy(true); setNotice("");
    const r = await api("/payments/session", {
      method: "POST", body: { loan_id: loan.loan_id, amount: quote.amount, payment_type: quote.payment_type, card_id: cardId, idempotency_key: idemKey.current },
    });
    if (!r.ok) {
      setBusy(false);
      if (r.code === "PAYMENT_IN_PROGRESS" && r.data.payment_id) { setStep("status"); poll(r.data.payment_id); return; }
      if (r.errors?.amount) { setErr(r.errors.amount); setStep("amount"); return; }
      setNotice(r.message);
      return;
    }
    const session = r.data;
    setTxn(session.payment);
    const co = session.checkout;
    const pid = session.payment.payment_id;

    const onPaid = async (resp) => {
      setStep("status");
      const v = await api("/payments/verify", { method: "POST", body: resp });
      if (v.ok) setTxn(v.data.payment);
      poll(pid);
    };
    // Cancels only if Razorpay saw no attempt; otherwise shows the real (server) status.
    const onClosed = async (message = "Payment cancelled. No money was taken.") => {
      setBusy(false);
      const c = await api(`/payments/${pid}/cancel`, { method: "POST" });
      if (c.ok && c.data.payment.status === "CANCELLED") { setNotice(message); setTxn(null); return; }
      setStep("status");
      poll(pid);
    };

    // Saved card: pay with its Razorpay token — the bank's OTP page is the only step.
    if (co.token && co.prefill?.email) {
      const Custom = await loadRazorpay("custom");
      try {
        if (!Custom) throw new Error("unavailable");
        const rz = new Custom({ key: co.key });
        rz.on("payment.success", onPaid);
        rz.on("payment.error", () => onClosed("The payment was not completed. No money was taken."));
        rz.createPayment({
          amount: co.amount, currency: co.currency, order_id: co.order_id, description: co.description,
          email: co.prefill.email, contact: co.prefill.contact,
          method: "card", customer_id: co.customer_id, token: co.token,
        });
        return;
      } catch {
        /* fall through to Standard Checkout, which also lists the saved card */
      }
    }

    // First payment with this card (or fallback): Razorpay's window, where the card is
    // entered once and the user can consent to save it for OTP-only payments next time.
    const Checkout = await loadRazorpay("checkout");
    if (!Checkout) {
      setBusy(false);
      await api(`/payments/${pid}/cancel`, { method: "POST" });
      setNotice("Couldn't load the secure payment window. Check your connection and try again.");
      return;
    }
    const { token: _token, ...options } = co;
    const rzp = new Checkout({
      ...options,
      prefill: co.prefill || {},                   // only the contact Razorpay needs for saved cards
      notes: {},
      theme: { color: "#00C594" },
      handler: onPaid,
      modal: { confirm_close: true, ondismiss: () => onClosed() },
    });
    rzp.on("payment.failed", () => { /* the final status comes from the server, not this event */ });
    rzp.open();
  };

  if (step === "status") {
    return txn ? <PaymentReceipt txn={txn} /> : (
      <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm" role="status">
        <Loader2 className="w-5 h-5 animate-spin text-mint-600" aria-hidden />Checking payment status…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-surface-2 border border-line p-4 grid grid-cols-2 gap-3">
        <div><p className="text-xs text-muted">Payable balance</p><p className="font-bold text-fg tabular">{fmtINR(payable)}</p></div>
        <div><p className="text-xs text-muted">Next EMI</p><p className="font-semibold text-fg tabular">{fmtINR(loan.emi_amount)}</p></div>
        <div className="col-span-2 text-xs text-muted">{loan.product_name || "Loan"} {loan.masked_number} · due {fmtDate(loan.next_due_date)}</div>
      </div>

      {payment.message && <Banner tone={payment.configured ? "warn" : "error"} icon={AlertTriangle}>{payment.message}</Banner>}
      {notice && <Banner tone="error">{notice}</Banner>}

      {step === "amount" && (
        <>
          <fieldset>
            <legend className="text-sm font-medium text-fg mb-2">What are you paying?</legend>
            <div className="grid grid-cols-2 gap-2">
              {[["EMI", "EMI", emi], ["PART_PAYMENT", "Other amount", null]].map(([k, label, amt]) => (
                <label key={k} className={`p-3 rounded-[var(--radius-control)] border cursor-pointer transition-colors
                  ${type === k ? "border-mint-600 bg-accent-soft" : "border-line-strong hover:border-mint-600/50"} ${k === "EMI" && !emi ? "opacity-50 pointer-events-none" : ""}`}>
                  <input type="radio" name="ptype" className="sr-only" checked={type === k} disabled={k === "EMI" && !emi}
                    onChange={() => { setType(k); setErr(""); if (amt) setAmount(Number(amt).toFixed(2)); else setAmount(""); }} />
                  <span className="block text-sm font-semibold text-fg">{label}</span>
                  <span className="block text-xs text-muted tabular">{amt ? fmtINR(amt) : k === "EMI" ? "Not available" : "Enter amount"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Amount (₹)" error={err}>
            {(p) => <input {...p} className={`${inputCls(err)} text-lg font-bold tabular`} inputMode="decimal" value={amount}
              readOnly={type === "EMI"} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setErr(""); }} placeholder="0.00" />}
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-fg mb-2">Pay with</legend>
            {cards === null ? <p className="text-sm text-muted">Loading your cards…</p>
              : cards.length === 0 ? <p className="text-sm text-danger-fg">Link a credit card to pay your EMI.</p> : (
              <div className="space-y-2">
                {cards.map((c) => (
                  <label key={c.card_id} className={`flex items-center gap-3 p-3 rounded-[var(--radius-control)] border cursor-pointer transition-colors
                    ${cardId === c.card_id ? "border-mint-600 bg-accent-soft" : "border-line-strong hover:border-mint-600/50"}`}>
                    <input type="radio" name="paycard" className="sr-only" checked={cardId === c.card_id}
                      onChange={() => { setCardId(c.card_id); setErr(""); }} />
                    <BankLogo provider={c.provider} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{c.provider.short_name} <span className="tabular text-muted font-normal">{c.masked_number}</span></span>
                      <span className="block text-xs text-muted">{c.saved_for_payments ? "Saved · pay with bank OTP only" : "First payment: enter card once, then OTP only"}</span>
                    </span>
                    {c.saved_for_payments && <Badge tone="success" icon={ShieldCheck}>OTP only</Badge>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <Button className="w-full" size="lg" onClick={review} loading={busy} disabled={!payment.configured || !card}>Review payment</Button>
          {!payment.configured && <p className="text-xs text-muted text-center">Payments are unavailable until the payment provider is configured.</p>}
        </>
      )}

      {step === "review" && quote && (
        <>
          <div className="rounded-2xl border border-mint-600/30 bg-accent-soft p-4">
            <Row k="Paying" v={`${loan.provider_name} · ${loan.masked_number}`} />
            <Row k="Type" v={titleCase(quote.payment_type)} />
            <Row k="Amount" v={<span className="tabular">{fmtINR(quote.amount)}</span>} />
            <Row k="Convenience fee" v={<span className="tabular">{fmtINR(quote.fee)}</span>} />
            <div className="border-t border-mint-600/20 mt-1.5 pt-1.5">
              <Row k="Total" strong v={<span className="tabular text-lg">{fmtINR(quote.total)}</span>} />
            </div>
            <Row k="Card" v={card ? `${card.provider.short_name} ${card.masked_number}` : "—"} />
            <Row k="Payer" v={<span className="tabular">{user?.mobile_number}</span>} />
            <Row k="Via" v={`Razorpay${payment.mode === "test" ? " (test mode)" : ""}`} />
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {card?.saved_for_payments
              ? `Your ${card.provider.short_name} card ${card.masked_number} is saved with Razorpay. Next you'll only confirm the OTP from your bank.`
              : `First payment with your ${card ? `${card.provider.short_name} card ${card.masked_number}` : "card"}: enter it once in Razorpay's secure window and tick “Save card”. After that you'll only need your bank's OTP.`}
            {" "}The payment is confirmed only after we verify it with Razorpay.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("amount")} disabled={busy}>Edit</Button>
            <Button className="flex-[2]" onClick={pay} loading={busy}>Confirm and pay {fmtINR(quote.total)}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Receipt / transaction details. Status text always accompanies the colour. */
export function PaymentReceipt({ txn }) {
  const st = PAYMENT_STATUS[txn.status] || PAYMENT_STATUS.CREATED;
  const Icon = txn.status === "SUCCESS" ? CheckCircle2 : txn.status === "FAILED" ? XCircle : txn.status === "PENDING" ? Clock : txn.status === "CANCELLED" ? XCircle : Loader2;
  const color = { success: "text-mint-600", danger: "text-danger", warning: "text-warning", neutral: "text-muted" }[st.tone];
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center pt-1" aria-live="polite">
        <Icon className={`w-14 h-14 ${color} ${txn.status === "CREATED" ? "animate-spin" : ""}`} aria-hidden />
        <p className="text-3xl font-extrabold text-fg mt-3 tabular">{fmtINR(txn.total)}</p>
        <Badge tone={st.tone} className="mt-2">{st.label}</Badge>
        <p className="text-sm text-muted mt-3 max-w-xs">
          {txn.status === "SUCCESS" ? "Confirmed with Razorpay. Your dashboard has been updated."
            : txn.status === "FAILED" ? (txn.failure_reason || "The payment didn't go through. If money left your account, your bank will refund it.")
            : txn.status === "CANCELLED" ? "This payment was cancelled before any money was taken."
            : "Waiting for confirmation from the payment provider. This updates automatically — please don't pay again."}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg mb-1"><ReceiptText className="w-4 h-4" aria-hidden />Transaction details</p>
        <Row k="Reference" v={<span className="font-mono text-xs">{txn.receipt_number}</span>} />
        <Row k="Loan" v={txn.loan_label} />
        <Row k="Type" v={titleCase(txn.payment_type)} />
        <Row k="Amount" v={<span className="tabular">{fmtINR(txn.amount)}</span>} />
        <Row k="Fee" v={<span className="tabular">{fmtINR(txn.fee)}</span>} />
        {txn.card_label && <Row k="Card" v={txn.card_label} />}
        {txn.payment_method && <Row k="Method" v={txn.payment_method.toUpperCase()} />}
        {txn.provider_payment_id && <Row k="Razorpay ID" v={<span className="font-mono text-xs">{txn.provider_payment_id}</span>} />}
        <Row k="Created" v={fmtDateTime(txn.created_at)} />
        {txn.completed_at && <Row k="Completed" v={fmtDateTime(txn.completed_at)} />}
        {txn.status === "SUCCESS" && <Row k="Lender credit" v={SETTLEMENT_LABEL[txn.settlement_status]} />}
        {txn.provider_mode === "test" && <p className="text-xs text-warning-fg pt-1">Test mode — no real money moved.</p>}
      </div>
    </div>
  );
}
