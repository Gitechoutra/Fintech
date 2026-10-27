import { useEffect, useState } from "react";
import { CheckCircle2, Fingerprint, ScanFace } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { createCredential, isBiometricAvailable } from "../utils/webauthn";
import { Banner, Button } from "./ui";

/** Enrol fingerprint / Face ID / Windows Hello through WebAuthn. Success is only
 *  shown after the server verified the device's attestation — never on click. */
export function BiometricSetup({ enabled, disabled, onEnabled, disabledReason }) {
  const { api } = useAuth();
  const [supported, setSupported] = useState(null);     // null = checking
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { isBiometricAvailable().then(setSupported); }, []);

  const enable = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const opt = await api("/security/webauthn/register/options", { method: "POST" });
    if (!opt.ok) { setBusy(false); setMsg({ tone: "error", text: opt.message }); return; }
    let credential;
    try {
      credential = await createCredential(opt.data.options);
    } catch (e) {
      setBusy(false);
      setMsg({ tone: "warn", text: e?.name === "NotAllowedError"
        ? "Biometric setup was cancelled or timed out. You can try again, or keep using your MPIN."
        : "This device couldn't complete biometric setup. Your MPIN still protects your account." });
      return;
    }
    const label = /Android/i.test(navigator.userAgent) ? "Android device" : /iPhone|iPad/i.test(navigator.userAgent) ? "iPhone / iPad"
      : /Windows/i.test(navigator.userAgent) ? "Windows Hello" : /Mac/i.test(navigator.userAgent) ? "Mac" : "This device";
    const r = await api("/security/webauthn/register/verify", { method: "POST", body: { credential, label } });
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: r.message }); return; }
    setMsg({ tone: "success", text: "Biometric unlock is on for this device." });
    onEnabled?.();
  };

  return (
    <div>
      <div className="flex items-center gap-3 text-accent" aria-hidden>
        <span className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center"><Fingerprint className="w-6 h-6" /></span>
        <span className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center"><ScanFace className="w-6 h-6" /></span>
      </div>
      <h3 className="text-lg font-bold text-fg mt-4">Enable biometrics</h3>
      <p className="text-sm text-muted mt-1 leading-relaxed">
        Unlock with your fingerprint or face instead of typing the MPIN. The check happens on your device —
        we never receive or store fingerprint or face data.
      </p>
      <div className="mt-4 space-y-3">
        {enabled ? (
          <Banner tone="success" icon={CheckCircle2}>Biometric unlock is enabled on your account.</Banner>
        ) : disabled ? (
          <p className="text-sm text-subtle">{disabledReason}</p>
        ) : supported === false ? (
          <Banner tone="info">This browser or device doesn't offer fingerprint or Face ID unlock. You'll unlock with your MPIN.</Banner>
        ) : (
          <Button variant="secondary" onClick={enable} loading={busy} disabled={supported === null}>
            <Fingerprint className="w-4 h-4" aria-hidden />Enable biometrics
          </Button>
        )}
        {msg && !enabled && <Banner tone={msg.tone}>{msg.text}</Banner>}
      </div>
    </div>
  );
}
