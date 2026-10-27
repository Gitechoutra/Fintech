import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, FlaskConical, Mail, Smartphone } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { OtpInput } from "../../components/OtpInput";
import { Banner, Button, Card, Field, Row, inputCls } from "../../components/ui";
import { validateEmail, validateName, validateOtp } from "../../utils/validation";
import { StepHeader } from "./OnboardingPage";

/** Step 01 — account: mobile (verified at sign-up) + name + verified email. */
export function AccountStep({ onboarding, go }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const done = onboarding.steps.account === "DONE";
  const needsProfile = !user.full_name || !user.email;

  if (done && !editing) {
    return (
      <>
        <StepHeader eyebrow="Step 01 · Account" title="Your account is verified" />
        <Card className="p-5 sm:p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-3">
            <BadgeCheck className="w-6 h-6 text-mint-600" aria-hidden />
            <p className="font-semibold text-fg">Mobile number and email verified</p>
          </div>
          <Row k="Name" v={user.full_name} />
          <Row k="Mobile" v={<span className="tabular">{user.mobile_number}</span>} />
          <Row k="Email" v={user.email} />
          <Button className="w-full sm:w-auto mt-5" onClick={() => go(onboarding.next_step)}>
            Continue <ArrowRight className="w-4 h-4" aria-hidden />
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <StepHeader eyebrow="Step 01 · Account" title={needsProfile || editing ? "Complete your profile" : "Verify your email"}
        text={needsProfile || editing ? "Your mobile number is verified. Add your name and email, then verify the email."
          : "Your mobile number is verified. Now confirm your email address with a 6-digit code."} />
      <Card className="p-5 sm:p-6 max-w-xl">
        <div className="flex items-center gap-2 text-sm text-success-fg mb-5">
          <Smartphone className="w-4 h-4" aria-hidden />Mobile <span className="tabular font-semibold">{user.mobile_number}</span> verified
        </div>
        {needsProfile || editing
          ? <ProfileForm onSaved={() => setEditing(false)} />
          : <EmailVerify onChangeEmail={() => setEditing(true)} onVerified={() => go("loan")} />}
      </Card>
    </>
  );
}

function ProfileForm({ onSaved }) {
  const { api, user, refreshUser } = useAuth();
  const [form, setForm] = useState({ full_name: user.full_name || "", email: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = { full_name: validateName(form.full_name), email: validateEmail(form.email) };
    Object.keys(errs).forEach((k) => !errs[k] && delete errs[k]);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError("");
    const r = await api("/authentication/me", { method: "PATCH", body: { full_name: form.full_name.trim(), email: form.email.trim() } });
    setBusy(false);
    if (!r.ok) { if (Object.keys(r.errors).length) setErrors(r.errors); else setError(r.message); return; }
    await refreshUser();
    onSaved();
  };

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Full name" error={errors.full_name}>
        {(p) => <input {...p} className={inputCls(errors.full_name)} value={form.full_name} autoComplete="name"
          onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); setErrors((x) => ({ ...x, full_name: "" })); }} />}
      </Field>
      <Field label="Email address" error={errors.email}>
        {(p) => <input {...p} type="email" className={inputCls(errors.email)} value={form.email} autoComplete="email" inputMode="email"
          onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors((x) => ({ ...x, email: "" })); }} />}
      </Field>
      <Button type="submit" className="w-full sm:w-auto" loading={busy}>Save and verify email <ArrowRight className="w-4 h-4" aria-hidden /></Button>
    </form>
  );
}

function EmailVerify({ onChangeEmail, onVerified }) {
  const { api, user, refreshUser } = useAuth();
  const [sent, setSent] = useState(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  const startCooldown = (secs) => {
    clearInterval(timer.current);
    setCooldown(secs);
    timer.current = setInterval(() => setCooldown((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };

  const send = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const r = await api("/authentication/email/send", { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "OTP_COOLDOWN") startCooldown(r.data.retry_after || 30);
      if (r.code === "ALREADY_VERIFIED") { await refreshUser(); onVerified(); return; }
      setError(r.message);
      return;
    }
    setSent(r.data); setOtp("");
    startCooldown(r.data.resend_after || 30);
  };

  const verify = async (code = otp) => {
    if (busy) return;
    const m = validateOtp(code);
    if (m) { setError(m); return; }
    setBusy(true); setError("");
    const r = await api("/authentication/email/verify", { method: "POST", body: { otp: code } });
    setBusy(false);
    if (!r.ok) {
      setOtp("");
      setError(r.code === "OTP_INVALID" && r.data.attempts_remaining > 0
        ? `Incorrect code. ${r.data.attempts_remaining} attempt${r.data.attempts_remaining === 1 ? "" : "s"} left.` : r.message);
      return;
    }
    await refreshUser();
    onVerified();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface-2 border border-line">
        <Mail className="w-5 h-5 text-accent mt-0.5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="text-fg">{sent ? <>We sent a 6-digit code to <span className="font-semibold">{sent.email}</span>.</>
            : <>We'll send a 6-digit code to <span className="font-semibold">{user.email}</span>.</>}</p>
          <Button variant="link" onClick={onChangeEmail} className="mt-1">Change email</Button>
        </div>
      </div>
      {sent?.dev_console_otp && (
        <Banner tone="warn" icon={FlaskConical} title="Development mode — no email was sent">
          {sent.dev_otp ? <>Your code is <span className="font-mono font-bold text-fg">{sent.dev_otp}</span>.</> : "Check the backend log for the code."}
        </Banner>
      )}
      {!sent ? (
        <>
          {error && <Banner tone="error">{error}</Banner>}
          <Button onClick={send} loading={busy} disabled={cooldown > 0}>{cooldown > 0 ? `Send code in ${cooldown}s` : "Send verification code"}</Button>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(""); }} onComplete={verify} disabled={busy}
            error={error} autoFocus label="Email verification code" />
          <p className="min-h-6 mt-2 text-[13px] text-danger-fg" role="alert">{error}</p>
          <Button type="submit" className="mt-2" loading={busy} disabled={otp.length !== 6}>Verify email</Button>
          <p className="text-sm text-muted mt-4" aria-live="polite">
            Didn't get it? {cooldown > 0 ? <span className="tabular">Resend in {cooldown}s</span>
              : <Button variant="link" onClick={send} disabled={busy}>Resend code</Button>}
          </p>
        </form>
      )}
    </div>
  );
}
