import { motion } from "motion/react";
import { ArrowRight, Check, CreditCard, Fingerprint, Landmark, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button, Card } from "../../components/ui";

/** Onboarding complete — reflects the server's view of each step. */
export function DoneStep({ onboarding, go }) {
  const { user } = useAuth();
  const s = onboarding.steps;
  const items = [
    { icon: UserRound, label: "Mobile number and email verified", ok: s.account === "DONE" },
    { icon: Landmark, label: "Bajaj Finance loan verified", ok: s.loan === "DONE" },
    { icon: CreditCard, label: "Credit card linked", ok: s.card === "DONE" },
    { icon: Fingerprint, label: user.biometric_enabled ? "MPIN and biometrics set up" : "MPIN set up", ok: s.security === "DONE" },
  ];
  return (
    <div className="max-w-xl mx-auto text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="w-20 h-20 rounded-full bg-mint-600 mx-auto flex items-center justify-center shadow-[0_16px_40px_-12px_rgb(0_197_148/0.7)]">
        <Check className="w-10 h-10 text-on-primary" strokeWidth={3} aria-hidden />
      </motion.div>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg mt-6">You're all set!</h1>
      <p className="text-muted mt-2 text-[15px]">Welcome to your finance dashboard, {(user.full_name || "").split(" ")[0]}.</p>
      <Card className="p-5 sm:p-6 mt-8 text-left">
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${it.muted ? "bg-surface-2" : "bg-accent-soft"}`}>
                <it.icon className={`w-[18px] h-[18px] ${it.muted ? "text-muted" : "text-accent"}`} aria-hidden />
              </span>
              <span className={`text-sm font-medium ${it.muted ? "text-muted" : "text-fg"}`}>{it.label}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Button size="lg" className="mt-8 w-full sm:w-auto" onClick={() => go("dashboard")}>
        Go to dashboard <ArrowRight className="w-4 h-4" aria-hidden />
      </Button>
    </div>
  );
}
