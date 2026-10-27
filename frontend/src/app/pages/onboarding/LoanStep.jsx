import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LoanLinker } from "../../components/LoanLinker";
import { LoanSummary } from "../../components/LoanSummary";
import { Banner, Button, Card, Skeleton } from "../../components/ui";
import { StepHeader } from "./OnboardingPage";

/** Step 02 — verify the Bajaj Finance loan (loan account number + customer ID → OTP). */
export function LoanStep({ go }) {
  const { api, refreshUser } = useAuth();
  const [loans, setLoans] = useState(null);
  const [justLinked, setJustLinked] = useState(null);

  const load = async () => {
    const r = await api("/loans");
    setLoans(r.ok ? r.data.loans : []);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLinked = async (loan) => {
    setJustLinked(loan);
    await Promise.all([load(), refreshUser()]);
  };

  return (
    <>
      <StepHeader eyebrow="Step 02 · Loan" title="Link your loan account"
        text="Enter your Bajaj Finance loan account number and customer ID. We'll verify them with an OTP." />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <Card className="p-5 sm:p-7">
          {loans === null ? (
            <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-12" /></div>
          ) : loans.length > 0 ? (
            <div className="space-y-4">
              {justLinked && (
                <Banner tone="success" icon={CheckCircle2} title="Loan verified and linked">
                  Your {justLinked.provider_name} loan {justLinked.masked_number} is verified.
                </Banner>
              )}
              {loans.map((l) => <LoanSummary key={l.loan_id} loan={l} />)}
              <Button onClick={() => go("card")}>Continue to card <ArrowRight className="w-4 h-4" aria-hidden /></Button>
            </div>
          ) : (
            <LoanLinker onLinked={onLinked} />
          )}
        </Card>
        <aside className="space-y-3 text-sm">
          <Card className="p-5">
            <p className="font-semibold text-fg">Where to find these</p>
            <p className="text-muted mt-1.5 leading-relaxed">
              Your loan account number and customer ID are on your loan agreement and in the Bajaj Finserv app.
            </p>
          </Card>
          <Card className="p-5">
            <p className="font-semibold text-fg">Your data</p>
            <p className="text-muted mt-1.5 leading-relaxed">
              Both are encrypted on our servers and never shown again — only the last 4 digits of the loan number.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
