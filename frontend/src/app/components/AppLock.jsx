import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isBiometricAvailable } from "../utils/webauthn";
import { Logo } from "./Logo";
import { PinPad } from "./PinPad";
import { Button } from "./ui";

/** Full-screen lock: MPIN keypad, plus fingerprint / Face ID when enrolled and the
 *  device supports it. Shown on app open and after idle; routes stay mounted underneath. */
export function AppLock() {
  const { lockInfo, unlockWithMpin, unlockWithBiometric, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [bioOk, setBioOk] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (!lockInfo?.biometric_enabled) return;
    isBiometricAvailable().then(setBioOk);
  }, [lockInfo]);

  const bio = async () => {
    setBusy(true); setError("");
    const r = await unlockWithBiometric();
    setBusy(false);
    if (!r.ok) setError(r.message);
  };

  // Offer biometrics once automatically, like a native banking app.
  useEffect(() => {
    if (bioOk && !tried.current) { tried.current = true; bio(); }
  }, [bioOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (value) => {
    setBusy(true); setError("");
    const r = await unlockWithMpin(value);
    setBusy(false);
    if (!r.ok) {
      setPin("");
      setShake((n) => n + 1);
      setError(r.data?.attempts_remaining !== undefined
        ? `Incorrect MPIN. ${r.data.attempts_remaining} attempt${r.data.attempts_remaining === 1 ? "" : "s"} left before you are signed out.`
        : r.message);
    }
  };

  const first = (lockInfo?.full_name || "").split(" ")[0];

  return (
    <div className="fixed inset-0 z-[80] bg-page overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 brand-glow">
        <Logo className="mb-8" />
        <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-accent" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-fg text-center">{first ? `Welcome back, ${first}` : "Welcome back"}</h1>
        <p className="text-sm text-muted mt-1 mb-8 text-center">Enter your 4-digit MPIN to unlock {lockInfo?.mobile_number ? `(${lockInfo.mobile_number})` : ""}</p>
        <PinPad value={pin} onChange={(v) => { setPin(v); setError(""); }} onComplete={submit}
          disabled={busy} error={shake} onBiometric={bioOk ? bio : undefined} />
        <p className="min-h-10 mt-5 text-sm text-danger-fg text-center max-w-xs" role="alert">{error}</p>
        <Button variant="link" onClick={logout}>Not you? Sign in with OTP</Button>
      </div>
    </div>
  );
}
