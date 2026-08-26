import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { createCashfreeBillingSubscription } from "@/lib/api";
import {
  CASHFREE_PROCESSING_MESSAGE,
  createSingleFlight,
  getCashfreeCheckoutErrorMessage,
  startCashfreeSubscriptionCheckout,
} from "@/services/cashfreeCheckoutService";

export default function CashfreeCheckoutButton({
  planId,
  billingCycle,
  onNotice,
  onStarted,
  label = "Choose Plan with Cashfree",
}) {
  const startOnce = useMemo(() => createSingleFlight(), []);
  const create = useMutation({
    mutationFn: () =>
      startOnce(() =>
        startCashfreeSubscriptionCheckout({
          planId,
          billingCycle,
          createSubscription: createCashfreeBillingSubscription,
        })
      ),
    onSuccess: () => {
      onNotice(CASHFREE_PROCESSING_MESSAGE);
      onStarted?.();
    },
    onError: (error) => onNotice(getCashfreeCheckoutErrorMessage(error)),
  });

  return (
    <Button
      className="mt-5"
      variant="outline"
      disabled={create.isPending}
      onClick={() => create.mutate()}
    >
      {create.isPending ? "Creating subscription..." : label}
    </Button>
  );
}
