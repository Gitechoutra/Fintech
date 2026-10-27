import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Bell, Fingerprint, KeyRound, LogOut, Monitor, Moon, Smartphone, Sun, Trash2, UserRound, Wrench } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { BiometricSetup } from "../../components/BiometricSetup";
import { MpinCreator } from "../../components/MpinCreator";
import { fmtDate, fmtDateTime, timeAgo } from "../../utils/format";
import { validateEmail, validateName } from "../../utils/validation";
import { Badge, Banner, Button, Card, ConfirmDialog, Field, Row, Skeleton, inputCls, useToast } from "../../components/ui";
import { PageHeader } from "./AppShell";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "security", label: "Security", icon: KeyRound },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "account", label: "Account", icon: Wrench },
];

/** Settings: profile, security, notifications and account. */
export function SettingsPage() {
  const { hash } = useLocation();
  const [active, setActive] = useState(hash.slice(1) || "profile");

  useEffect(() => {
    const id = hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [hash]);

  // Highlight the section in view.
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <PageHeader title="Settings" text="Manage your profile, security, notifications and account." />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)] gap-6 items-start">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-24">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto -mx-1 px-1 pb-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(s.id); }}
                  aria-current={active === s.id ? "true" : undefined}
                  className={`flex items-center gap-2.5 h-10 px-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors
                    ${active === s.id ? "bg-accent-soft text-accent" : "text-muted hover:text-fg hover:bg-surface-2"}`}>
                  <s.icon className="w-4 h-4" aria-hidden />{s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6 min-w-0">
          <ProfileSection />
          <SecuritySection />
          <NotificationsSection />
          <AccountSection />
        </div>
      </div>
    </>
  );
}

function Section({ id, title, text, children }) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-h`} className="p-5 sm:p-6 scroll-mt-24">
      <h2 id={`${id}-h`} className="text-lg font-bold text-fg">{title}</h2>
      {text && <p className="text-sm text-muted mt-0.5">{text}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

/* ── Profile ── */
function ProfileSection() {
  const { api, user, refreshUser } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: user.full_name || "", email: "" });
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const e = { full_name: validateName(form.full_name), email: form.email ? validateEmail(form.email) : "" };
    Object.keys(e).forEach((k) => !e[k] && delete e[k]);
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    setBusy(true);
    // Omitting email keeps the current (verified) address.
    const body = { full_name: form.full_name.trim(), ...(form.email.trim() ? { email: form.email.trim() } : {}) };
    const r = await api("/authentication/me", { method: "PATCH", body });
    setBusy(false); setConfirm(false);
    if (!r.ok) { if (Object.keys(r.errors).length) setErrors(r.errors); else toast("error", r.message); return; }
    toast("success", body.email ? "Saved. Verify your new email to continue." : "Profile updated.");
    setEditing(false);
    await refreshUser();
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (form.email.trim()) setConfirm(true); else save();
  };

  return (
    <Section id="profile" title="Profile" text="Your name, mobile number and email.">
      {!editing ? (
        <>
          <Row k="Name" v={user.full_name} />
          <Row k="Mobile" v={<span className="tabular">{user.mobile_number} <Badge tone="success" className="ml-1">Verified</Badge></span>} />
          <Row k="Email" v={<span>{user.email || "—"} {user.email_verified && <Badge tone="success" className="ml-1">Verified</Badge>}</span>} />
          <Row k="Member since" v={fmtDate(user.created_on)} />
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setEditing(true); setForm({ full_name: user.full_name || "", email: "" }); }}>Edit profile</Button>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4 max-w-md">
          <Field label="Full name" error={errors.full_name}>
            {(p) => <input {...p} className={inputCls(errors.full_name)} value={form.full_name} autoComplete="name"
              onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); setErrors({}); }} />}
          </Field>
          <Field label="New email address" optional error={errors.email} hint={`Current: ${user.email}. Leave empty to keep it.`}>
            {(p) => <input {...p} type="email" className={inputCls(errors.email)} value={form.email} autoComplete="email" inputMode="email"
              onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors({}); }} />}
          </Field>
          <p className="text-xs text-muted">Your mobile number is your sign-in and can't be changed here.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </form>
      )}
      {confirm && (
        <ConfirmDialog title="Change your email?" confirmLabel="Change email" busy={busy}
          message="You'll need to verify the new address with a code before you can use the dashboard again."
          onConfirm={save} onClose={() => setConfirm(false)} />
      )}
    </Section>
  );
}

/* ── Security ── */
function SecuritySection() {
  const { api, user, refreshUser } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [changing, setChanging] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/security/settings");
    if (r.ok) setSettings(r.data);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const removeBio = async (id) => {
    const r = await api(`/security/webauthn/${id}`, { method: "DELETE" });
    if (r.ok) { toast("success", "Biometric device removed."); await Promise.all([load(), refreshUser()]); }
    else toast("error", r.message);
  };
  const signOutDevice = async (id) => {
    const r = await api(`/security/sessions/${id}`, { method: "DELETE" });
    if (r.ok) { toast("success", "Device signed out."); load(); } else toast("error", r.message);
  };
  const signOutOthers = async () => {
    setRevoking(true);
    const r = await api("/security/sessions/revoke-others", { method: "POST" });
    setRevoking(false);
    if (r.ok) { toast("success", r.data.message); load(); } else toast("error", r.message);
  };

  return (
    <Section id="security" title="Security"
      text={`The app locks after ${settings?.idle_lock_minutes ?? 15} minutes of inactivity and asks for your MPIN or biometrics.`}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-fg flex items-center gap-2"><KeyRound className="w-4 h-4 text-accent" aria-hidden />MPIN</p>
              <p className="text-sm text-muted">Set {settings ? fmtDate(settings.mpin_set_at) : "—"}</p>
            </div>
            {!changing && <Button variant="secondary" size="sm" onClick={() => setChanging(true)}>Change MPIN</Button>}
          </div>
          {changing && (
            <div className="mt-4 p-4 rounded-2xl border border-line bg-surface-2 max-w-md">
              <MpinCreator change compact onSaved={() => { setChanging(false); toast("success", "MPIN changed."); load(); }} />
              <div className="text-center mt-2"><Button variant="ghost" size="sm" onClick={() => setChanging(false)}>Cancel</Button></div>
            </div>
          )}
        </div>

        <div className="h-px bg-line" />

        <div>
          <p className="font-semibold text-fg flex items-center gap-2 mb-3"><Fingerprint className="w-4 h-4 text-accent" aria-hidden />Biometric unlock</p>
          {settings === null ? <Skeleton className="h-20" /> : (
            <>
              {settings.biometrics.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {settings.biometrics.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 p-3 rounded-2xl border border-line">
                      <Fingerprint className="w-5 h-5 text-accent" aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-fg truncate">{b.label}</span>
                        <span className="block text-xs text-muted">Added {fmtDate(b.created_on)}{b.last_used_on ? ` · last used ${fmtDate(b.last_used_on)}` : ""}</span>
                      </span>
                      <button type="button" onClick={() => removeBio(b.id)} aria-label={`Remove ${b.label}`}
                        className="p-2 rounded-xl text-muted hover:text-danger-fg hover:bg-danger-soft"><Trash2 className="w-4 h-4" aria-hidden /></button>
                    </li>
                  ))}
                </ul>
              )}
              <BiometricSetup enabled={false} onEnabled={() => { load(); refreshUser(); }} />
              {user.biometric_enabled && <p className="text-xs text-muted mt-2">Add this device too if it isn't listed above.</p>}
            </>
          )}
        </div>

        <div className="h-px bg-line" />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="font-semibold text-fg flex items-center gap-2"><Smartphone className="w-4 h-4 text-accent" aria-hidden />Signed-in devices</p>
            {settings?.sessions.length > 1 && (
              <Button variant="secondary" size="sm" onClick={signOutOthers} loading={revoking}>Sign out all other devices</Button>
            )}
          </div>
          {settings === null ? <Skeleton className="h-16" /> : (
            <ul className="space-y-2">
              {settings.sessions.map((s) => (
                <li key={s.session_id} className="flex items-center gap-3 p-3 rounded-2xl border border-line">
                  <Monitor className="w-5 h-5 text-muted shrink-0" aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-fg truncate">{deviceName(s.user_agent)}
                      {s.current && <Badge tone="success" className="ml-2">This device</Badge>}</span>
                    <span className="block text-xs text-muted">Signed in {fmtDateTime(s.created_on)} · active {timeAgo(s.last_active_at)}</span>
                  </span>
                  {!s.current && <Button size="sm" variant="ghost" onClick={() => signOutDevice(s.session_id)}>Sign out</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

const deviceName = (ua = "") => {
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
};

/* ── Notifications ── */
function NotificationsSection() {
  const { api, user, refreshUser } = useAuth();
  const toast = useToast();
  const prefs = user.notifications || {};
  const [busy, setBusy] = useState(null);

  const toggle = async (key) => {
    setBusy(key);
    const r = await api("/authentication/preferences", { method: "PATCH", body: { [key]: !prefs[key] } });
    setBusy(null);
    if (r.ok) { await refreshUser(); toast("success", "Notification preferences saved."); } else toast("error", r.message);
  };

  return (
    <Section id="notifications" title="Notifications" text={`Email alerts are sent to ${user.email || "your verified email"}.`}>
      {!prefs.email_available && (
        <div className="mb-4"><Banner tone="warn">Email delivery isn't configured on the server yet, so alerts can't be sent. Your choices are still saved.</Banner></div>
      )}
      <ul className="divide-y divide-line">
        <ToggleRow label="Payment alerts" text="When an EMI payment succeeds or fails." checked={!!prefs.payment_alerts}
          busy={busy === "payment_alerts"} onChange={() => toggle("payment_alerts")} />
        <ToggleRow label="Sign-in alerts" text="When your account is signed in to with an OTP." checked={!!prefs.login_alerts}
          busy={busy === "login_alerts"} onChange={() => toggle("login_alerts")} />
      </ul>
    </Section>
  );
}

function ToggleRow({ label, text, checked, busy, onChange }) {
  const id = `t-${label.replace(/\s/g, "")}`;
  return (
    <li className="flex items-center justify-between gap-4 py-3.5">
      <span>
        <label htmlFor={id} className="block text-sm font-semibold text-fg cursor-pointer">{label}</label>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={onChange} disabled={busy}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-60 ${checked ? "bg-mint-600" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </li>
  );
}

/* ── Account ── */
function AccountSection() {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [confirm, setConfirm] = useState(false);
  return (
    <Section id="account" title="Account" text="Appearance and sign-out.">
      <p className="text-sm font-semibold text-fg mb-2">Theme</p>
      <div className="grid grid-cols-3 gap-2 max-w-sm" role="group" aria-label="Theme">
        {[["system", Monitor, "System"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]].map(([k, Icon, l]) => (
          <button key={k} type="button" onClick={() => setTheme(k)} aria-pressed={theme === k}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border transition-colors
              ${theme === k ? "border-mint-600 bg-accent-soft text-accent" : "border-line text-muted hover:bg-surface-2"}`}>
            <Icon className="w-5 h-5" aria-hidden />{l}
          </button>
        ))}
      </div>
      <div className="h-px bg-line my-6" />
      <Button variant="secondary" onClick={() => setConfirm(true)}><LogOut className="w-4 h-4" aria-hidden />Sign out of this device</Button>
      {confirm && (
        <ConfirmDialog title="Sign out?" confirmLabel="Sign out" message="You'll need an OTP and your MPIN to sign in again."
          onConfirm={logout} onClose={() => setConfirm(false)} />
      )}
    </Section>
  );
}
