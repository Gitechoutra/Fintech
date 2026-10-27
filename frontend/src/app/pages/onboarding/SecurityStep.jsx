import { useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BiometricSetup } from "../../components/BiometricSetup";
import { MpinCreator } from "../../components/MpinCreator";
import { Badge, Banner, Button, Card } from "../../components/ui";
import { StepHeader } from "./OnboardingPage";

/** Step 04 — App security: MPIN (required) + biometrics (optional).
 *  Saving the MPIN completes onboarding on the server, so the profile is only
 *  re-read on "Finish setup" — otherwise the page would move on before the user
 *  could choose biometrics. */
export function SecurityStep({ onboarding }) {
  const { user, refreshUser } = useAuth();
  const [mpinSet, setMpinSet] = useState(onboarding.steps.security === "DONE");
  const [bioEnabled, setBioEnabled] = useState(user.biometric_enabled);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    await refreshUser();           // onboarding complete → the page moves on to "You're all set"
    setFinishing(false);
  };

  return (
    <>
      <StepHeader eyebrow="Step 04 · Security" title="Set up app security"
        text="Your MPIN locks the app on every device. Add biometrics for faster unlocking where your device supports it." />

      <div className="grid md:grid-cols-2 gap-5 items-start">
        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-2 mb-5">
            <span className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center"><KeyRound className="w-5 h-5 text-accent" aria-hidden /></span>
              <span><span className="block text-xs font-bold uppercase tracking-widest text-muted">Option A</span>
                <span className="block font-bold text-fg">4-digit MPIN</span></span>
            </span>
            <Badge tone={mpinSet ? "success" : "neutral"}>{mpinSet ? "Created" : "Required"}</Badge>
          </div>
          {mpinSet ? (
            <Banner tone="success" icon={CheckCircle2} title="Your MPIN is set">
              You'll use it to unlock LendEase. You can change it later from the dashboard.
            </Banner>
          ) : (
            <MpinCreator compact onSaved={() => setMpinSet(true)} />
          )}
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-2 mb-5">
            <span className="block text-xs font-bold uppercase tracking-widest text-muted">Option B</span>
            <Badge tone={bioEnabled ? "success" : "neutral"}>{bioEnabled ? "Enabled" : "Optional"}</Badge>
          </div>
          <BiometricSetup enabled={bioEnabled} disabled={!mpinSet}
            disabledReason="Available once your MPIN is created — the MPIN stays as your fallback."
            onEnabled={() => setBioEnabled(true)} />
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-8">
        <Button onClick={finish} loading={finishing} disabled={!mpinSet} size="lg">
          Finish setup <ArrowRight className="w-4 h-4" aria-hidden />
        </Button>
        {!mpinSet && <p className="text-sm text-muted">Create your MPIN to continue.</p>}
        {mpinSet && !bioEnabled && <p className="text-sm text-muted">You can enable biometrics later from the dashboard.</p>}
      </div>
    </>
  );
}
