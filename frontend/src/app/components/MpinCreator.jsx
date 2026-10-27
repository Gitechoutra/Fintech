import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { validateMpin } from "../utils/validation";
import { PinPad } from "./PinPad";
import { Banner, Button } from "./ui";

/** Create (or change) the 4-digit MPIN: enter → confirm → save. Change mode asks
 *  for the current MPIN first. Digits are held only in component state. */
export function MpinCreator({ change = false, onSaved, compact }) {
  const { api } = useAuth();
  const [phase, setPhase] = useState(change ? "current" : "new");   // current | new | confirm
  const [current, setCurrent] = useState("");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const fail = (msg, back) => { setError(msg); setShake((n) => n + 1); setValue(""); if (back) setPhase(back); };

  const onComplete = async (v) => {
    if (phase === "current") { setCurrent(v); setValue(""); setPhase("new"); return; }
    if (phase === "new") {
      const m = validateMpin(v);
      if (m) return fail(m);
      setFirst(v); setValue(""); setError(""); setPhase("confirm");
      return;
    }
    if (v !== first) { setFirst(""); return fail("The MPINs didn't match. Please create it again.", "new"); }
    setBusy(true);
    const body = { new_mpin: first, confirm_mpin: v, ...(change ? { current_mpin: current } : {}) };
    const r = await api("/security/mpin", { method: "POST", body });
    setBusy(false);
    setFirst(""); setCurrent("");
    if (!r.ok) {
      const back = r.errors?.current_mpin ? "current" : "new";
      return fail(r.errors?.current_mpin || r.errors?.new_mpin || r.message, change ? back : "new");
    }
    setValue("");
    onSaved?.();
  };

  const title = { current: "Enter your current MPIN", new: change ? "Choose a new MPIN" : "Create your MPIN", confirm: "Confirm your MPIN" }[phase];

  return (
    <div>
      <p className="text-center font-semibold text-fg" aria-live="polite">{title}</p>
      <p className="text-center text-sm text-muted mt-1 mb-6">
        {phase === "confirm" ? "Enter the same 4 digits again." : "4 digits. Avoid repeated or sequential numbers like 1111 or 1234."}
      </p>
      <PinPad value={value} onChange={(v) => { setValue(v); setError(""); }} onComplete={onComplete}
        disabled={busy} error={shake} label={title} compact={compact} />
      <div className="min-h-12 mt-4">{error && <Banner tone="error">{error}</Banner>}</div>
      {phase === "confirm" && (
        <div className="text-center">
          <Button variant="link" onClick={() => { setPhase("new"); setFirst(""); setValue(""); }}>Start over</Button>
        </div>
      )}
    </div>
  );
}
