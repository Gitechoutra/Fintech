import { Navigate, useNavigate, useParams } from "react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../../components/Logo";
import { ProgressSteps } from "../../components/ProgressSteps";
import { Button } from "../../components/ui";
import { AccountStep } from "./AccountStep";
import { LoanStep } from "./LoanStep";
import { SecurityStep } from "./SecurityStep";
import { CardStep } from "./CardStep";
import { DoneStep } from "./DoneStep";

const ORDER = ["account", "loan", "card", "security"];
const SCREENS = { account: AccountStep, loan: LoanStep, card: CardStep, security: SecurityStep, done: DoneStep };

/** /onboarding/:step — the server decides which step is next; the URL can only
 *  show that step or an earlier, completed one (to review it). */
export function OnboardingPage() {
  const { step } = useParams();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  if (status === "signed_out") return <Navigate to="/welcome" replace />;
  if (!user) return null;                                   // locked: AppLock overlays this route

  const ob = user.onboarding;
  if (step === "done") {
    if (!ob.complete) return <Navigate to={`/onboarding/${ob.next_step}`} replace />;
  } else if (!ORDER.includes(step)) {
    return <Navigate to={ob.complete ? "/dashboard" : `/onboarding/${ob.next_step}`} replace />;
  } else if (ob.complete) {
    return <Navigate to="/onboarding/done" replace />;
  } else if (ORDER.indexOf(step) > ORDER.indexOf(ob.next_step)) {
    return <Navigate to={`/onboarding/${ob.next_step}`} replace />;
  }

  const Screen = SCREENS[step];
  const go = (s) => navigate(s === "dashboard" ? "/dashboard" : `/onboarding/${s}`);

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-30 bg-page/85 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Logo size="sm" />
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4" aria-hidden />Sign out</Button>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-4">
          <ProgressSteps steps={ob.steps} viewing={step === "done" ? "dashboard" : step} complete={ob.complete} />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Screen onboarding={ob} go={go} />
      </main>
    </div>
  );
}

/** Shared heading for every step. */
export function StepHeader({ eyebrow, title, text }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
      <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-tight text-fg mt-2 leading-tight">{title}</h1>
      {text && <p className="text-muted mt-2 text-[15px] leading-relaxed">{text}</p>}
    </div>
  );
}
