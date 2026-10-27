import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BiometricSetup } from "../../components/BiometricSetup";
import { MpinCreator } from "../../components/MpinCreator";
import { fmtDate } from "../../utils/format";
import { Button, ModalShell, Skeleton, useToast } from "../../components/ui";

export function SecurityDialog({ onClose }) {
  const { api, user, refreshUser } = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [changing, setChanging] = useState(false);

  const load = async () => {
    const r = await api("/security/settings");
    if (r.ok) setSettings(r.data);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const removeBio = async (id) => {
    const r = await api(`/security/webauthn/${id}`, { method: "DELETE" });
    if (r.ok) { toast("success", "Biometric device removed."); await Promise.all([load(), refreshUser()]); }
    else toast("error", r.message);
  };

  return (
    <ModalShell title="Security settings" subtitle={`The app locks after ${settings?.idle_lock_minutes ?? 15} minutes of inactivity.`} onClose={onClose}>
      <section>
        <h3 className="font-bold text-fg">MPIN</h3>
        <p className="text-sm text-muted mt-0.5">Set {settings ? fmtDate(settings.mpin_set_at) : "—"}</p>
        {changing ? (
          <div className="mt-4 p-4 rounded-2xl border border-line bg-surface-2">
            <MpinCreator change compact onSaved={() => { setChanging(false); toast("success", "MPIN changed."); load(); }} />
            <div className="text-center mt-2"><Button variant="ghost" size="sm" onClick={() => setChanging(false)}>Cancel</Button></div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setChanging(true)}>Change MPIN</Button>
        )}
      </section>

      <div className="h-px bg-line my-6" />

      <section>
        {settings === null ? <Skeleton className="h-24" /> : (
          <>
            {settings.biometrics.length > 0 && (
              <ul className="mb-5 space-y-2">
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
            {user.biometric_enabled && <p className="text-xs text-muted mt-2">You can add this device too if it isn't listed above.</p>}
          </>
        )}
      </section>
    </ModalShell>
  );
}
