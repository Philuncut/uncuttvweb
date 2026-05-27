"use client";

import { useEffect } from "react";
import { retryPendingPayPalRecoveries } from "@/lib/retry-pending-paypal-recoveries";

export default function PayPalRecoveryBoot() {
  useEffect(() => {
    void retryPendingPayPalRecoveries();
  }, []);

  return null;
}
