import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { CardLinker } from "../../components/CardLinker";
import { LinkedCardTile } from "../../components/LinkedCardTile";
import { Banner, Button, Card } from "../../components/ui";
import { StepHeader } from "./OnboardingPage";

/** Step 03 — choose the bank / card provider and link the credit card with an OTP. */
export function CardStep({ onboarding, go }) {
  const { user, refreshUser } = useAuth();
  const [linked, setLinked] = useState(null);

  const onLinked = async (card) => {
    setLinked(card);
    await refreshUser();
  };

  return (
    <>
      <StepHeader eyebrow="Step 03 · Card" title="Link your credit card"
        text="Select the bank or card provider where you have a credit card. We'll verify it with an OTP." />
      <Card className="p-5 sm:p-7">
        {linked ? (
          <div className="space-y-5">
            <Banner tone="success" icon={CheckCircle2} title="Card linked">
              Your {linked.provider.short_name} card {linked.masked_number} is now linked.
            </Banner>
            <LinkedCardTile card={linked} holder={user.full_name} />
            <Button size="lg" onClick={() => go("security")}>Continue to security <ArrowRight className="w-4 h-4" aria-hidden /></Button>
          </div>
        ) : onboarding.steps.card === "DONE" ? (
          <div className="space-y-4">
            <Banner tone="success" icon={CheckCircle2} title="Your card is linked" />
            <Button onClick={() => go(onboarding.next_step)}>Continue <ArrowRight className="w-4 h-4" aria-hidden /></Button>
          </div>
        ) : (
          <CardLinker onLinked={onLinked} />
        )}
      </Card>
    </>
  );
}
