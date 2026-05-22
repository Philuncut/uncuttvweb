import { Resend } from "resend";
import { getTranslation } from "@/lib/translations";
import {
  BANK_CUSTOMER_FROM,
  buildBankTransferEmailHtml,
  buildCustomerEmailHtml,
  buildInvoiceResendEmailHtml,
  buildOfficeEmailHtml,
  CONFIRMATION_EMAIL_META_KEY,
  confirmationSendBlocked,
  metaFlagYes,
  CUSTOMER_FROM,
  PDF_PENDING_META_KEY,
  fetchInvoicePdfWithRetry,
  fetchOrder,
  getCustomerDisplayName,
  isResendConfigured,
  OFFICE_FROM,
  OFFICE_TO,
  resolveIsWholesaleOrder,
  updateOrderMeta,
  type BankTransferEmailDetails,
  type OrderConfirmationWooOrder,
} from "@/lib/order-confirmation-email";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";

export type OrderPaymentType =
  | "stripe"
  | "paypal"
  | "klarna"
  | "bank_transfer";

export type SendOrderConfirmationWithPdfOptions = {
  paymentType: OrderPaymentType;
  bankTransferDetails?: BankTransferEmailDetails;
  locale?: "de" | "en";
};

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function customerEmail(order: OrderConfirmationWooOrder): string {
  return asString(order.billing?.email);
}

function buildCustomerHtml(
  order: OrderConfirmationWooOrder,
  orderId: number,
  options: SendOrderConfirmationWithPdfOptions,
  pdfAttached: boolean
): string {
  const orderNumber = asString(order.number) || String(orderId);

  if (options.paymentType === "bank_transfer" && options.bankTransferDetails) {
    return buildBankTransferEmailHtml(orderNumber, options.bankTransferDetails, {
      pdfAttached,
      orderId,
    });
  }

  return buildCustomerEmailHtml(order, { pdfAttached, orderId });
}

function customerEmailSubject(
  order: OrderConfirmationWooOrder,
  orderId: number,
  options: SendOrderConfirmationWithPdfOptions
): string {
  const orderNumber = asString(order.number) || String(orderId);
  if (options.paymentType === "bank_transfer") {
    const locale = options.locale ?? options.bankTransferDetails?.locale ?? "de";
    return getTranslation("EMAIL_BANK_SUBJECT", locale);
  }
  return `Deine UncutTV-Bestellung #${orderNumber} ist eingegangen`;
}

function customerFromAddress(options: SendOrderConfirmationWithPdfOptions): string {
  return options.paymentType === "bank_transfer"
    ? BANK_CUSTOMER_FROM
    : CUSTOMER_FROM;
}

/**
 * Sends customer (+ office) order confirmation via Resend with optional PDF.
 * Idempotent via WooCommerce meta. Never throws.
 */
export async function sendOrderConfirmationWithPdf(
  orderId: number,
  options: SendOrderConfirmationWithPdfOptions
): Promise<void> {
  try {
    if (!isResendConfigured()) {
      console.warn("[OrderMail] RESEND_API_KEY missing, skipping order", orderId);
      return;
    }

    const order = await fetchOrder(orderId);

    if (confirmationSendBlocked(order)) {
      console.log(
        `[OrderMail] Confirmation already sent or PDF pending for order ${orderId}, skipping`
      );
      return;
    }

    const to = customerEmail(order);
    if (!to || !to.includes("@")) {
      console.warn(`[OrderMail] No customer email on order ${orderId}, skipping`);
      return;
    }

    const orderNumber = asString(order.number) || String(orderId);
    const currency = (asString(order.currency) || "EUR").toUpperCase();
    const totalFormatted = formatPrice(
      parsePrice(String(order.total ?? "0")),
      currency
    );
    const customerDisplayName = getCustomerDisplayName(order);

    const pdf = await fetchInvoicePdfWithRetry(orderId, orderNumber);
    const isWholesale = await resolveIsWholesaleOrder(order);
    const resend = new Resend(process.env.RESEND_API_KEY);

    const customerPayload: Parameters<typeof resend.emails.send>[0] = {
      from: customerFromAddress(options),
      to,
      subject: customerEmailSubject(order, orderId, options),
      html: buildCustomerHtml(order, orderId, options, !!pdf),
    };

    if (pdf) {
      customerPayload.attachments = [
        {
          filename: pdf.filename,
          content: Buffer.from(pdf.buffer),
        },
      ];
    }

    const customerResult = await resend.emails.send(customerPayload);

    if (customerResult.error) {
      console.error(
        `[OrderMail] Customer email failed for order ${orderId}:`,
        customerResult.error
      );
      return;
    }

    if (isWholesale) {
      console.log(
        `[OrderMail] Office mail skipped for wholesale order #${orderId} — handled by notify-wholesale-order`
      );
    } else if (options.paymentType !== "bank_transfer") {
      const officeResult = await resend.emails.send({
        from: OFFICE_FROM,
        to: OFFICE_TO,
        subject: `Neue Bestellung #${orderNumber} — ${customerDisplayName} — ${totalFormatted}`,
        html: buildOfficeEmailHtml(order, orderId),
      });

      if (officeResult.error) {
        console.error(
          `[OrderMail] Office email failed for order ${orderId}:`,
          officeResult.error
        );
      } else {
        console.log(
          `[OrderMail] Office confirmation sent for order ${orderId} → ${OFFICE_TO}`
        );
      }
    }

    console.log(
      `[OrderMail] Customer confirmation sent for order ${orderId} → ${to}${pdf ? " (PDF attached)" : " (no PDF, pdf_pending)"}`
    );

    if (pdf) {
      await updateOrderMeta(orderId, [
        { key: CONFIRMATION_EMAIL_META_KEY, value: "yes" },
        { key: PDF_PENDING_META_KEY, value: "" },
      ]);
    } else {
      await updateOrderMeta(orderId, [
        { key: PDF_PENDING_META_KEY, value: "yes" },
      ]);
    }
  } catch (err) {
    console.error(`[OrderMail] Unexpected error for order ${orderId}:`, err);
  }
}

/**
 * Cron follow-up: resend invoice PDF for orders with pdf_pending meta.
 */
export async function sendPendingInvoicePdfEmail(
  orderId: number
): Promise<"success" | "failed" | "skipped"> {
  if (!isResendConfigured()) {
    console.warn("[CronInvoiceResend] RESEND_API_KEY missing");
    return "skipped";
  }

  try {
    const order = await fetchOrder(orderId);

    if (!metaFlagYes(order, PDF_PENDING_META_KEY)) {
      return "skipped";
    }

    const to = customerEmail(order);
    if (!to || !to.includes("@")) {
      return "skipped";
    }

    const orderNumber = asString(order.number) || String(orderId);
    const pdf = await fetchInvoicePdfWithRetry(orderId, orderNumber, {
      attempts: 2,
      delayMs: 2000,
      logPrefix: "[CronInvoiceResend]",
    });

    if (!pdf) {
      return "failed";
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: CUSTOMER_FROM,
      to,
      subject: `Deine UncutTV-Rechnung zu Bestellung #${orderNumber}`,
      html: buildInvoiceResendEmailHtml(order, orderId),
      attachments: [
        {
          filename: pdf.filename,
          content: Buffer.from(pdf.buffer),
        },
      ],
    });

    if (result.error) {
      console.error(
        `[CronInvoiceResend] Resend failed for order ${orderId}:`,
        result.error
      );
      return "failed";
    }

    await updateOrderMeta(orderId, [
      { key: CONFIRMATION_EMAIL_META_KEY, value: "yes" },
      { key: PDF_PENDING_META_KEY, value: "" },
    ]);

    console.log(
      `[CronInvoiceResend] Invoice PDF sent for order ${orderId} → ${to}`
    );
    return "success";
  } catch (err) {
    console.error(`[CronInvoiceResend] Error for order ${orderId}:`, err);
    return "failed";
  }
}
