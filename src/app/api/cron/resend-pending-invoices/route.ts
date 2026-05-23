import { sendPendingInvoicePdfEmail } from "@/lib/send-order-confirmation-with-pdf";
import { wooFetch } from "@/lib/woocommerce";
import { PDF_PENDING_META_KEY } from "@/lib/order-confirmation-email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ORDERS_PER_RUN = 20;
const ORDER_DELAY_MS = 300;

type WooOrderRow = {
  id: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Woo `after` filter: only orders from the last 7 days (skip stale list false-positives). */
function ordersAfterIsoSevenDaysAgo(): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  return cutoff.toISOString();
}

export async function GET(request: Request): Promise<Response> {
  const expected =
    typeof process.env.CRON_SECRET === "string" &&
    process.env.CRON_SECRET.trim()
      ? `Bearer ${process.env.CRON_SECRET.trim()}`
      : null;
  const authHeaderIn = request.headers.get("authorization");
  if (!expected || authHeaderIn !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let runs = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const orders = await wooFetch<WooOrderRow[]>(
      "/orders",
      {
        meta_key: PDF_PENDING_META_KEY,
        meta_value: "yes",
        per_page: String(MAX_ORDERS_PER_RUN),
        orderby: "date",
        order: "desc",
        after: ordersAfterIsoSevenDaysAgo(),
      },
      { cache: "no-store" }
    );

    for (let i = 0; i < orders.length; i++) {
      const orderId = Number(orders[i]?.id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        skipped += 1;
        continue;
      }

      runs += 1;
      const outcome = await sendPendingInvoicePdfEmail(orderId);
      if (outcome === "success") {
        success += 1;
      } else if (outcome === "failed") {
        failed += 1;
      } else {
        skipped += 1;
      }

      if (i < orders.length - 1) {
        await sleep(ORDER_DELAY_MS);
      }
    }

    console.log(
      `[CronInvoiceResend] runs=${runs}, success=${success}, failed=${failed}, skipped=${skipped}`
    );

    return Response.json({
      ok: true,
      runs,
      success,
      failed,
      skipped,
    });
  } catch (err) {
    console.error("[CronInvoiceResend] cron failed:", err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        runs,
        success,
        failed,
        skipped,
      },
      { status: 500 }
    );
  }
}
