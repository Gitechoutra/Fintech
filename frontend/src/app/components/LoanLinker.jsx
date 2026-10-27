import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, FlaskConical, Landmark, RotateCcw, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { normalizeIdentifier, validateIdentifier, validateOtp } from "../utils/validation";
import { OtpInput } from "./OtpInput";
import { Banner, Button, EmptyState, Field, Skeleton, inputCls } from "./ui";

/** Next action to suggest for each failure the server can report. */
const NEXT_ACTION = {
  LOAN_NOT_FOUND: "Check the number on your loan agreement or lender app and try again.",
  OWNERSHIP_NOT_VERIFIED: "Ask your lender to update the mobile number on the loan, then try again.",
  PROVIDER_UNAVAILABLE: "This is on the lender's side. Please try again in a few minutes.",
  LINKED_ELSEWHERE: "If this is your loan, contact support so we can help.",
  LINK_LIMIT: "For your security, linking is paused for an hour after many attempts.",
};

/**
 * Provider → identifiers (from master data, e.g. loan account number + customer ID) → OTP → linked.
 * The identifiers are sent once to our backend and never stored in the browser.
 */
export function LoanLinker({ onLinked }) {
  const { api } = useAuth();
  const [cfg, setCfg] = useState(null);            // { configured, providers, message }
  const [loadErr, setLoadErr] = useState("");
  const [provider, setProvider] = useState("");
  const [values, setValues] = useState({});
  const [fieldErr, setFieldErr] = useState({});
  const [error, setError] = useState(null);        // { message, code }
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("form");      // form | challenge | pending
  const [attempt, setAttempt] = useState(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  const startCooldown = (secs) => {
    clearInterval(timer.current);
    setCooldown(secs);
    timer.current = setInterval(() => setCooldown((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };

  const load = async () => {
    setLoadErr("");
    const r = await api("/loans/providers");
    if (!r.ok) { setLoadErr(r.message); return; }
    setCfg(r.data);
    if (r.data.providers.length === 1) setProvider(r.data.providers[0].code);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = cfg?.providers.find((p) => p.code === provider);

  const start = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const errs = {};
    if (!selected) errs.provider_code = "Select your lender.";
    else {
      for (const spec of selected.required_identifiers) {
        const m = validateIdentifier(values[spec.key], spec.pattern, spec.label);
        // Keep the expected format visible: the error replaces the hint under the field.
        if (m) errs[spec.key] = spec.hint && String(values[spec.key] || "").trim() ? `${m} ${spec.hint}` : m;
      }
    }
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    const identifiers = Object.fromEntries(selected.required_identifiers.map((s) => [s.key, normalizeIdentifier(values[s.key])]));
    const r = await api("/loans/link/start", { method: "POST", body: { provider_code: provider, identifiers } });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "OTP_COOLDOWN") startCooldown(r.data.retry_after || 30);
      if (r.code === "VALIDATION_ERROR" && Object.keys(r.errors).length) setFieldErr(r.errors);
      else setError({ message: r.message, code: r.code });
      return;
    }
    setAttempt(r.data);
    setCode("");
    if (r.data.resend_after) startCooldown(r.data.resend_after);
    setPhase(r.data.status === "PENDING_REVIEW" ? "pending" : "challenge");
  };

  const verify = async (value = code) => {
    if (busy) return;
    const m = validateOtp(value);
    if (m) { setFieldErr({ code: m }); return; }
    setBusy(true); setError(null); setFieldErr({});
    const r = await api("/loans/link/verify", { method: "POST", body: { attempt_id: attempt.attempt_id, code: value } });
    setBusy(false);
    if (!r.ok) {
      setCode("");
      if (r.code === "LENDER_OTP_INVALID") {
        setFieldErr({ code: `Incorrect code. ${r.data.attempts_remaining} attempt${r.data.attempts_remaining === 1 ? "" : "s"} left.` });
      } else {
        setError({ message: r.message, code: r.code });
        if (["LINK_ATTEMPTS_EXCEEDED", "LENDER_OTP_EXPIRED", "LINK_NOT_ACTIVE"].includes(r.code)) setPhase("form");
      }
      return;
    }
    setValues({});
    setAttempt(null);
    setPhase("form");
    onLinked?.(r.data.loan);
  };

  const reset = () => { setPhase("form"); setAttempt(null); setError(null); setFieldErr({}); setCode(""); setValues({}); };

  if (loadErr) return <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{loadErr}</Banner>;
  if (!cfg) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-12" /><Skeleton className="h-12 w-40" /></div>;
  if (!cfg.configured) {
    return <EmptyState icon={Landmark} title="Loan linking isn't available yet"
      text={`${cfg.message} No lender can be verified until an authorised lender integration is set up.`} />;
  }

  if (phase === "pending") {
    return (
      <div className="space-y-4">
        <Banner tone="warn" icon={Clock} title="Verification pending with your lender">
          {attempt.message} Loan {attempt.masked_number} with {attempt.provider_name}.
        </Banner>
        <Button variant="secondary" onClick={reset}><RotateCcw className="w-4 h-4" aria-hidden />Link a different loan</Button>
      </div>
    );
  }

  if (phase === "challenge") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-accent-soft border border-mint-600/20">
          <ShieldCheck className="w-5 h-5 text-accent mt-0.5 shrink-0" aria-hidden />
          {attempt.verification_method === "MOBILE_OTP" ? (
            <p className="text-sm text-fg leading-relaxed">
              We sent a 6-digit OTP to your registered mobile <span className="font-semibold tabular">{attempt.destination}</span> to
              verify your <span className="font-semibold">{attempt.provider_name}</span> loan <span className="font-semibold tabular">{attempt.masked_number}</span>.
            </p>
          ) : (
            <p className="text-sm text-fg leading-relaxed">
              <span className="font-semibold">{attempt.provider_name}</span> sent a 6-digit code to the mobile number registered
              on loan <span className="font-semibold tabular">{attempt.masked_number}</span>
              {attempt.destination ? <> (<span className="tabular">{attempt.destination}</span>)</> : null}. Entering it confirms the loan is yours.
            </p>
          )}
        </div>
        {attempt.dev_console_otp && (
          <Banner tone="warn" icon={FlaskConical} title="Development mode — no SMS was sent">
            {attempt.dev_otp ? <>Your OTP is <span className="font-mono font-bold text-fg">{attempt.dev_otp}</span>.</> : "Check the backend log for the OTP."}
          </Banner>
        )}
        {error && <Banner tone="error">{error.message}</Banner>}
        <div>
          <p className="text-sm font-medium text-fg mb-2">Enter OTP</p>
          <OtpInput value={code} onChange={(v) => { setCode(v); setFieldErr({}); }} onComplete={verify} disabled={busy}
            error={fieldErr.code} autoFocus label="OTP to verify your loan" />
          <p className="min-h-5 mt-2 text-[13px] text-danger-fg" role="alert">{fieldErr.code}</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" onClick={reset} disabled={busy}>Use a different loan</Button>
          <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify account</Button>
        </div>
        {attempt.verification_method === "MOBILE_OTP" && (
          <p className="text-sm text-muted" aria-live="polite">
            Didn&apos;t get it? {cooldown > 0 ? <span className="tabular">Resend in {cooldown}s</span>
              : <Button variant="link" onClick={start} disabled={busy}>Resend OTP</Button>}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={start} noValidate className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-fg mb-2">Loan provider</legend>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {cfg.providers.map((p) => (
            <label key={p.code} className={`flex items-center gap-3 p-3.5 rounded-[var(--radius-control)] border cursor-pointer transition-colors
              ${provider === p.code ? "border-mint-600 bg-accent-soft ring-4 ring-mint-500/10" : "border-line-strong bg-surface hover:border-mint-600/50"}`}>
              <input type="radio" name="provider" value={p.code} checked={provider === p.code} className="sr-only"
                onChange={() => { setProvider(p.code); setFieldErr({}); }} />
              <span className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-accent" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg truncate">{p.name}</span>
              </span>
              {provider === p.code && <CheckCircle2 className="w-5 h-5 text-mint-600 shrink-0" aria-hidden />}
            </label>
          ))}
        </div>
        {fieldErr.provider_code && <p className="mt-1.5 text-[13px] text-danger-fg" role="alert">{fieldErr.provider_code}</p>}
      </fieldset>

      {(selected?.required_identifiers || [{ key: "loan_account_number", label: "Loan account number" }]).map((spec) => (
        <Field key={spec.key} label={spec.label} error={fieldErr[spec.key]} hint={spec.hint}>
          {(p) => <input {...p} className={`${inputCls(fieldErr[spec.key])} uppercase tabular tracking-wide`} value={values[spec.key] || ""}
            onChange={(e) => { setValues((v) => ({ ...v, [spec.key]: e.target.value.slice(0, 40) })); setFieldErr({}); }}
            autoComplete="off" spellCheck={false} disabled={!selected} placeholder={selected ? "" : "Select your lender first"} />}
        </Field>
      ))}

      {error && (
        <Banner tone="error" title={error.message}>{NEXT_ACTION[error.code]}</Banner>
      )}

      <Button type="submit" loading={busy} disabled={cooldown > 0} className="w-full sm:w-auto">
        {cooldown > 0 ? `Verify account in ${cooldown}s` : "Verify account"}
      </Button>
      <p className="text-xs text-muted leading-relaxed">
        {selected?.verification_method === "MOBILE_OTP"
          ? "We verify the loan with a one-time code sent to your registered mobile number."
          : "We never treat a loan number as proof on its own — your lender must confirm the loan is registered to you."}
      </p>
    </form>
  );
}
