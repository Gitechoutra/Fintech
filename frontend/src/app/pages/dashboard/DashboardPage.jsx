import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { LoanLinker } from "../../components/LoanLinker";
import { PaymentFlow } from "../../components/PaymentFlow";
import { Banner, Button, Card, ModalShell, Skeleton, useToast } from "../../components/ui";
import { DashboardHeader } from "./DashboardHeader";
import { LoanPanel } from "./LoanPanel";
import { PaymentHistory } from "./PaymentHistory";
import { LinkedCards } from "./LinkedCards";
import { SecurityDialog } from "./SecurityDialog";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export function DashboardPage() {
  const { status, user, api } = useAuth();
  const toast = useToast();
  const [loans, setLoans] = useState(null);
  const [loanErr, setLoanErr] = useState("");
  const [payCfg, setPayCfg] = useState(null);
  const [lendersAvailable, setLendersAvailable] = useState(false);
  const [paying, setPaying] = useState(null);
  const [linking, setLinking] = useState(false);
  const [security, setSecurity] = useState(false);
  const history = useRef(null);

  const loadLoans = useCallback(async () => {
    const r = await api("/loans");
    if (r.ok) { setLoans(r.data.loans); setLoanErr(""); } else setLoanErr(r.message);
  }, [api]);

  useEffect(() => {
    if (status !== "ready" || !user?.onboarding?.complete) return;
    loadLoans();
    api("/payments/config").then((r) => setPayCfg(r.ok ? r.data : { configured: false, message: r.message }));
    api("/loans/providers").then((r) => setLendersAvailable(r.ok && r.data.configured));
  }, [status, user?.onboarding?.complete, loadLoans, api]);

  const onPaymentFinished = useCallback((txn) => {
    if (txn.status === "SUCCESS") toast("success", "Payment confirmed. Your dashboard is updated.");
    else if (txn.status === "FAILED") toast("error", "The payment did not go through.");
    loadLoans();
    history.current?.reload();
  }, [loadLoans, toast]);

  if (status === "signed_out") return <Navigate to="/welcome" replace />;
  if (!user) return null;
  if (!user.onboarding.complete) return <Navigate to={`/onboarding/${user.onboarding.next_step}`} replace />;

  const first = (user.full_name || "").split(" ")[0];
  // EMI payments need a loan; with no lender integrated the dashboard centres on linked cards.
  const hasLoans = loans?.length > 0;

  return (
    <div className="min-h-dvh bg-page">
      <DashboardHeader onOpenSecurity={() => setSecurity(true)} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <p className="text-sm text-muted">{greeting()},</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-fg">{first ? `${first}, welcome back` : "Welcome back"}</h1>
          </div>
          {lendersAvailable && (
            <Button variant="secondary" size="sm" onClick={() => setLinking(true)}><Plus className="w-4 h-4" aria-hidden />Link a loan</Button>
          )}
        </div>

        {hasLoans && payCfg && !payCfg.configured && (
          <div className="mb-5"><Banner tone="warn" icon={AlertTriangle} title="Payments are not available yet">{payCfg.message}</Banner></div>
        )}
        {hasLoans && payCfg?.configured && payCfg.mode === "test" && (
          <div className="mb-5"><Banner tone="warn" title="Payments are in test mode">{payCfg.message}</Banner></div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            {loanErr ? (
              <Banner tone="error" action={<Button size="sm" variant="secondary" onClick={loadLoans}>Retry</Button>}>{loanErr}</Banner>
            ) : loans === null ? (
              <Skeleton className="h-80 !rounded-[28px]" />
            ) : hasLoans ? (
              <>
                {loans.map((l) => (
                  <LoanPanel key={l.loan_id} loan={l} paymentsReady={!!payCfg?.configured}
                    onPay={setPaying} onUpdated={(nl) => setLoans((ls) => ls.map((x) => (x.loan_id === nl.loan_id ? nl : x)))} />
                ))}
                <PaymentHistory ref={history} />
              </>
            ) : (
              <LinkedCards featured />
            )}
          </div>
          <aside className="space-y-6">
            {hasLoans && <LinkedCards />}
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-bold text-fg">Account security</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between gap-3"><span className="text-muted">MPIN</span><span className="font-semibold text-success-fg">On</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Biometric unlock</span>
                  <span className={`font-semibold ${user.biometric_enabled ? "text-success-fg" : "text-muted"}`}>{user.biometric_enabled ? "On" : "Off"}</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Mobile</span><span className="font-semibold text-fg tabular">{user.mobile_number}</span></li>
              </ul>
              <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => setSecurity(true)}>Manage security</Button>
            </Card>
          </aside>
        </div>
      </main>

      {paying && (
        <ModalShell title={paying.open_payment_id ? "Payment status" : "Make a payment"}
          subtitle={`${paying.provider_name} · ${paying.masked_number}`} onClose={() => { setPaying(null); loadLoans(); }}>
          <PaymentFlow loan={paying} payment={payCfg || { configured: false }} onFinished={onPaymentFinished} />
        </ModalShell>
      )}
      {linking && (
        <ModalShell title="Link a loan" wide onClose={() => setLinking(false)}>
          <LoanLinker onLinked={() => { setLinking(false); toast("success", "Loan verified and linked."); loadLoans(); }} />
        </ModalShell>
      )}
      {security && <SecurityDialog onClose={() => setSecurity(false)} />}
    </div>
  );
}
