import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";
import { ArrowLeft, CreditCard, Fingerprint, FlaskConical, Landmark, LayoutDashboard, ShieldCheck, Smartphone } from "lucide-react";
import { publicPost, useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";
import { OtpInput } from "../components/OtpInput";
import { Banner, Button, Field, inputCls } from "../components/ui";
import { validateEmail, validateMobile, validateName, validateOtp } from "../utils/validation";

const JOURNEY = [
  { icon: Smartphone, title: "Verify mobile and email", text: "Register with one-time codes." },
  { icon: Landmark, title: "Verify your Bajaj Finance loan", text: "Loan account number + customer ID, with an OTP." },
  { icon: CreditCard, title: "Link your credit card", text: "Choose your bank and confirm with an OTP." },
  { icon: Fingerprint, title: "Secure the app", text: "4-digit MPIN, plus fingerprint or Face ID." },
  { icon: LayoutDashboard, title: "Pay your EMIs", text: "With your linked credit card." },
];

/** Registration / sign-in with mobile OTP. */
export function AuthPage() {
  const { status, setSession, requireUnlock, notice, clearNotice } = useAuth();
  const [mode, setMode] = useState("register");       // register | signin
  const [step, setStep] = useState("details");        // details | otp
  const [form, setForm] = useState({ full_name: "", mobile_number: "", email: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(null);             // response of /otp/send
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { if (notice) setBanner({ tone: "warn", text: notice }); }, [notice]);

  if (status === "ready") return <Navigate to="/" replace />;

  const startCooldown = (secs) => {
    clearInterval(timer.current);
    setCooldown(secs);
    timer.current = setInterval(() => setCooldown((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: "" })); };

  const sendOtp = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const errs = {};
    if (mode === "register") {
      errs.full_name = validateName(form.full_name);
      errs.email = validateEmail(form.email);
    }
    errs.mobile_number = validateMobile(form.mobile_number);
    Object.keys(errs).forEach((k) => !errs[k] && delete errs[k]);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true); setBanner(null); clearNotice();
    const r = await publicPost("/authentication/otp/send", { mobile_number: form.mobile_number });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "OTP_COOLDOWN" && sent) { startCooldown(r.data.retry_after || 30); setStep("otp"); return; }
      if (r.errors?.mobile_number) setErrors({ mobile_number: r.errors.mobile_number });
      else setBanner({ tone: "error", text: r.message });
      return;
    }
    setSent(r.data);
    setOtp("");
    setStep("otp");
    startCooldown(r.data.resend_after || 30);
  };

  const verify = async (code = otp) => {
    if (busy) return;
    const err = validateOtp(code);
    if (err) { setErrors({ otp: err }); return; }
    setBusy(true); setBanner(null);
    const body = { mobile_number: form.mobile_number, otp_code: code };
    if (mode === "register") Object.assign(body, { full_name: form.full_name.trim(), email: form.email.trim() });
    const r = await publicPost("/authentication/otp/verify", body);
    setBusy(false);
    if (!r.ok) {
      setOtp("");
      if (r.code === "OTP_INVALID") {
        setErrors({ otp: r.data.attempts_remaining > 0 ? `Incorrect code. ${r.data.attempts_remaining} attempt${r.data.attempts_remaining === 1 ? "" : "s"} left.` : r.message });
      } else if (r.code === "VALIDATION_ERROR" && (r.errors.full_name || r.errors.email)) {
        setErrors(r.errors); setStep("details");
      } else setErrors({ otp: r.message });
      return;
    }
    if (r.data.requires_unlock) requireUnlock(r.data.user);
    else setSession(r.data);
  };

  const switchMode = (m) => { setMode(m); setErrors({}); setBanner(null); };

  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] bg-page">
      {/* Brand panel — journey preview instead of illustrations */}
      <aside className="hidden lg:flex relative overflow-hidden bg-ink-950 text-white p-12 xl:p-16 flex-col justify-between">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_0%,rgb(0_245_184/0.22),transparent_70%),radial-gradient(50%_40%_at_100%_100%,rgb(0_145_112/0.25),transparent_70%)]" />
        <div className="relative"><Logo inverse /></div>
        <div className="relative max-w-md">
          <h2 className="text-4xl xl:text-[44px] font-extrabold leading-[1.1] tracking-tight">
            Your credit cards,<br /><span className="text-mint-500">linked and secured.</span>
          </h2>
          <p className="text-neutral-400 mt-4 text-[15px] leading-relaxed">
            Verify your account, link your credit cards with an OTP and protect the app with your MPIN.
          </p>
          <ol className="mt-10 space-y-1">
            {JOURNEY.map((j, i) => (
              <li key={j.title} className="flex items-start gap-4 py-2.5">
                <span className="relative flex flex-col items-center">
                  <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                    <j.icon className="w-[18px] h-[18px] text-mint-400" aria-hidden />
                  </span>
                </span>
                <span>
                  <span className="text-[11px] font-mono text-mint-300/80">{String(i + 1).padStart(2, "0")}</span>
                  <span className="block font-semibold -mt-0.5">{j.title}</span>
                  <span className="block text-sm text-neutral-400">{j.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-neutral-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-mint-600" aria-hidden />
          MPINs are never stored in readable form. We never ask for your full card number or CVV.
        </p>
      </aside>

      {/* Form */}
      <main className="flex flex-col px-4 sm:px-8 py-8 sm:py-12 lg:justify-center brand-glow lg:bg-none">
        <div className="w-full max-w-[440px] mx-auto">
          <Logo className="lg:hidden mb-10" />

          {step === "details" ? (
            <>
              <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight text-fg">
                {mode === "register" ? "Create your account" : "Welcome back"}
              </h1>
              <p className="text-muted mt-2">
                {mode === "register" ? "Start with a few details. We'll verify your mobile number and email with one-time codes."
                  : "Sign in with your registered mobile number."}
              </p>

              <div role="tablist" aria-label="Account" className="mt-7 grid grid-cols-2 p-1 rounded-[var(--radius-control)] bg-surface-2 border border-line">
                {[["register", "Create account"], ["signin", "Sign in"]].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={mode === k} type="button" onClick={() => switchMode(k)}
                    className={`h-10 rounded-xl text-sm font-semibold transition-colors ${mode === k ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                    {l}
                  </button>
                ))}
              </div>

              {banner && <div className="mt-5"><Banner tone={banner.tone}>{banner.text}</Banner></div>}

              <form onSubmit={sendOtp} noValidate className="mt-6 space-y-4">
                {mode === "register" && (
                  <Field label="Full name" error={errors.full_name}>
                    {(p) => <input {...p} className={inputCls(errors.full_name)} value={form.full_name} onChange={set("full_name")}
                      autoComplete="name" placeholder="As on your loan documents" />}
                  </Field>
                )}
                <Field label="Mobile number" error={errors.mobile_number} hint="We'll send a 6-digit code to this number.">
                  {(p) => (
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted font-medium pointer-events-none">+91</span>
                      <input {...p} className={`${inputCls(errors.mobile_number)} pl-13 tabular`} value={form.mobile_number}
                        onChange={(e) => { set("mobile_number")({ target: { value: e.target.value.replace(/[^\d\s+-]/g, "").slice(0, 14) } }); }}
                        inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" />
                    </div>
                  )}
                </Field>
                {mode === "register" && (
                  <Field label="Email address" error={errors.email}>
                    {(p) => <input {...p} type="email" className={inputCls(errors.email)} value={form.email} onChange={set("email")}
                      autoComplete="email" inputMode="email" placeholder="you@example.com" />}
                  </Field>
                )}
                <Button type="submit" size="lg" className="w-full !mt-6" loading={busy}>Continue</Button>
              </form>
              <p className="text-xs text-subtle mt-6 leading-relaxed">
                By continuing you agree to receive a one-time code by SMS. Standard messaging charges may apply.
              </p>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setStep("details"); setErrors({}); }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg -ml-1 px-1 py-1 rounded-lg">
                <ArrowLeft className="w-4 h-4" aria-hidden /> Change number
              </button>
              <h1 className="text-[28px] sm:text-3xl font-extrabold tracking-tight text-fg mt-5">Enter the code</h1>
              <p className="text-muted mt-2">
                {sent ? <>We sent a 6-digit code to <span className="font-semibold text-fg tabular">{sent.mobile_number}</span>.</> : "Enter the 6-digit code we sent you."}
              </p>

              {sent?.dev_console_otp && (
                <div className="mt-5">
                  <Banner tone="warn" icon={FlaskConical} title="Development mode — no SMS was sent">
                    The OTP provider is the development console. {sent.dev_otp ? <>Your code is <span className="font-mono font-bold text-fg">{sent.dev_otp}</span>.</> : "Check the backend log for the code."}
                  </Banner>
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="mt-7">
                <OtpInput value={otp} onChange={(v) => { setOtp(v); setErrors({}); }} onComplete={verify}
                  disabled={busy} error={errors.otp} autoFocus label="6-digit code" />
                <p className="min-h-6 mt-2 text-[13px] text-danger-fg" role="alert">{errors.otp}</p>
                <Button type="submit" size="lg" className="w-full mt-3" loading={busy} disabled={otp.length !== 6}>
                  Verify and continue
                </Button>
              </form>
              <p className="text-sm text-muted mt-5 text-center" aria-live="polite">
                Didn't get it?{" "}
                {cooldown > 0 ? <span className="tabular">Resend in {cooldown}s</span>
                  : <Button variant="link" onClick={sendOtp} disabled={busy}>Resend code</Button>}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
