import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, FlaskConical, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { validateIdentifier, validateOtp } from "../utils/validation";
import { BankLogo } from "./BankLogo";
import { OtpInput } from "./OtpInput";
import { Badge, Banner, Button, EmptyState, Field, Skeleton, inputCls } from "./ui";

/**
 * Choose bank / card provider → required identifiers (from master data) → OTP → linked.
 * The provider list, logos and the identifiers each provider needs all come from
 * GET /cards/providers (card_providers table).
 */
export function CardLinker({ onLinked }) {
  const { api } = useAuth();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);

  const load = async () => {
    setLoadErr("");
    const r = await api("/cards/providers");
    if (r.ok) setData(r.data); else setLoadErr(r.message);
  };
  useEffect(() => { load(); return () => clearInterval(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startCooldown = (secs) => {
    clearInterval(timer.current);
    setCooldown(secs);
    timer.current = setInterval(() => setCooldown((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.providers || [];
    return q ? all.filter((p) => `${p.name} ${p.short_name} ${p.card_product_name || ""}`.toLowerCase().includes(q)) : all;
  }, [data, query]);
  const popular = filtered.filter((p) => p.is_popular);
  const others = filtered.filter((p) => !p.is_popular);

  const choose = (p) => { setProvider(p); setValues({}); setErrors({}); setError(""); };

  const start = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const errs = {};
    for (const spec of provider.required_identifiers) {
      const m = validateIdentifier(values[spec.key], spec.pattern, spec.label);
      if (m) errs[spec.key] = m;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError("");
    const r = await api("/cards/link/start", { method: "POST", body: { provider_code: provider.code, identifiers: values } });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "OTP_COOLDOWN") startCooldown(r.data.retry_after || 30);
      if (r.code === "VALIDATION_ERROR" && Object.keys(r.errors).length) setErrors(r.errors);
      else setError(r.message);
      return;
    }
    setAttempt(r.data);
    setOtp("");
    startCooldown(r.data.resend_after || 30);
  };

  const verify = async (code = otp) => {
    if (busy) return;
    const m = validateOtp(code);
    if (m) { setErrors({ otp: m }); return; }
    setBusy(true); setError(""); setErrors({});
    const r = await api("/cards/link/verify", { method: "POST", body: { attempt_id: attempt.attempt_id, otp: code } });
    setBusy(false);
    if (!r.ok) {
      setOtp("");
      if (r.code === "OTP_INVALID") setErrors({ otp: `Incorrect OTP. ${r.data.attempts_remaining} attempt${r.data.attempts_remaining === 1 ? "" : "s"} left.` });
      else { setError(r.message); if (["LINK_ATTEMPTS_EXCEEDED", "OTP_EXPIRED", "LINK_NOT_ACTIVE"].includes(r.code)) setAttempt(null); }
      return;
    }
    setAttempt(null); setProvider(null); setValues({});
    onLinked?.(r.data.card);
  };

  if (loadErr) return <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}>{loadErr}</Banner>;
  if (!data) return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  // ── Step 3: OTP ──
  if (attempt) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-5 max-w-xl">
        <SelectedProvider provider={attempt.provider} extra={`Card ${attempt.masked_number}`} />
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-accent-soft border border-mint-600/20">
          <ShieldCheck className="w-5 h-5 text-accent mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-fg leading-relaxed">
            We sent a 6-digit OTP to your registered mobile <span className="font-semibold tabular">{attempt.destination}</span> to
            link your {attempt.provider.short_name} card ending <span className="font-semibold tabular">{attempt.masked_number.slice(-4)}</span>.
          </p>
        </div>
        {attempt.dev_console_otp && (
          <Banner tone="warn" icon={FlaskConical} title="Development mode — no SMS was sent">
            {attempt.dev_otp ? <>Your OTP is <span className="font-mono font-bold text-fg">{attempt.dev_otp}</span>.</> : "Check the backend log for the OTP."}
          </Banner>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        <div>
          <p className="text-sm font-medium text-fg mb-2">Enter OTP</p>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); setErrors({}); }} onComplete={verify} disabled={busy}
            error={errors.otp} autoFocus label="OTP to link your card" />
          <p className="min-h-5 mt-2 text-[13px] text-danger-fg" role="alert">{errors.otp}</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" onClick={() => { setAttempt(null); setError(""); }} disabled={busy}>Change card</Button>
          <Button type="submit" loading={busy} disabled={otp.length !== 6}>Verify and link card</Button>
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          Didn't get it? {cooldown > 0 ? <span className="tabular">Resend in {cooldown}s</span>
            : <Button variant="link" onClick={start} disabled={busy}>Resend OTP</Button>}
        </p>
      </form>
    );
  }

  // ── Step 2: identifiers for the chosen provider ──
  if (provider) {
    return (
      <form onSubmit={start} noValidate className="space-y-5 max-w-xl">
        <button type="button" onClick={() => setProvider(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg -ml-1 px-1 py-1 rounded-lg">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Choose a different bank
        </button>
        <SelectedProvider provider={provider} />
        {provider.required_identifiers.map((spec) => (
          <Field key={spec.key} label={spec.label} error={errors[spec.key]} hint={spec.hint}>
            {(p) => <input {...p} className={`${inputCls(errors[spec.key])} tabular tracking-[0.3em] text-lg font-semibold`}
              value={values[spec.key] || ""} inputMode="numeric" autoComplete="off" maxLength={spec.key === "last4" ? 4 : 40}
              onChange={(e) => { setValues((v) => ({ ...v, [spec.key]: spec.key === "last4" ? e.target.value.replace(/\D/g, "") : e.target.value })); setErrors({}); setError(""); }}
              placeholder={spec.key === "last4" ? "••••" : ""} />}
          </Field>
        ))}
        {!data.otp_available && <Banner tone="error">OTP verification isn't available right now: no SMS provider is configured.</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" loading={busy} disabled={!data.otp_available || cooldown > 0} className="w-full sm:w-auto">
          {cooldown > 0 ? `Send OTP in ${cooldown}s` : "Send OTP"}
        </Button>
      </form>
    );
  }

  // ── Step 1: choose bank / card provider ──
  if (!data.providers.length) {
    return <EmptyState title="No card providers available" text="The card provider list is empty. Please try again later." />;
  }
  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-subtle absolute left-4 top-1/2 -translate-y-1/2" aria-hidden />
        <input className={`${inputCls()} pl-11`} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search banks and card providers" aria-label="Search banks and card providers" />
      </div>
      {popular.length > 0 && <ProviderGrid title="Popular" providers={popular} onChoose={choose} />}
      {others.length > 0 && <ProviderGrid title="All banks" providers={others} onChoose={choose} />}
      {!filtered.length && <p className="text-sm text-muted">No bank matches “{query}”.</p>}
    </div>
  );
}

function ProviderGrid({ title, providers, onChoose }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">{title}</h3>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {providers.map((p) => {
          const soon = p.status !== "ACTIVE";
          return (
            <li key={p.code}>
              <button type="button" disabled={soon} onClick={() => onChoose(p)}
                className="w-full h-full flex items-center gap-3 p-3 rounded-[var(--radius-control)] border border-line-strong bg-surface text-left
                  hover:border-mint-600 hover:bg-accent-soft transition-colors disabled:opacity-60 disabled:hover:bg-surface disabled:hover:border-line-strong">
                <BankLogo provider={p} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg truncate">{p.short_name}</span>
                  {p.card_product_name ? <span className="block text-[11px] text-muted truncate">{p.card_product_name}</span>
                    : soon ? <Badge className="mt-0.5">Coming soon</Badge> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SelectedProvider({ provider, extra }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-mint-600/40 bg-accent-soft">
      <BankLogo provider={provider} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-fg truncate">{provider.name}</span>
        <span className="block text-sm text-muted truncate">{provider.card_product_name || "Credit card"}{extra ? ` · ${extra}` : ""}</span>
      </span>
      <CheckCircle2 className="w-5 h-5 text-mint-600 shrink-0" aria-hidden />
    </div>
  );
}
