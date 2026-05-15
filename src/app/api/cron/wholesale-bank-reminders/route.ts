import { Resend } from "resend";
import { WHOLESALE_REMINDER_TEMPLATES, type ReminderEmailData } from "@/lib/wholesale-reminder-templates";

export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["on-hold", "pending"] as const;

interface WooMeta {
  key?: string;
  value?: unknown;
}

interface WooOrder {
  id: number;
  number?: string | number;
  customer_id?: number;
  status?: string;
  date_created?: string;
  date_created_gmt?: string;
  billing?: {
    email?: string;
    first_name?: string;
    company?: string;
  };
  total?: string;
  meta_data?: WooMeta[];
}

interface WooCustomer {
  id?: number;
  role?: string;
  roles?: string[];
}

function resendConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "your_resend_api_key";
}

function metaValue(meta: WooMeta[] | undefined, key: string): string {
  const e = meta?.find((m) => m.key === key);
  if (e?.value == null) return "";
  return String(e.value).trim();
}

/** true wenn Schlüssel existiert UND Wert "yes". */
function hasMetaYes(order: WooOrder, key: string): boolean {
  const v = metaValue(order.meta_data, key).toLowerCase();
  return v === "yes";
}

function parseCreatedUtc(order: WooOrder): Date | null {
  const g =
    typeof order.date_created_gmt === "string" &&
    order.date_created_gmt.trim()
      ? order.date_created_gmt.trim()
      : typeof order.date_created === "string" && order.date_created.trim()
        ? order.date_created.trim()
        : null;
  if (!g) return null;
  const hasTz =
    /Z$/i.test(g) ||
    /[+-]\d{2}:?\d{2}$/.test(g) ||
    /[+-]\d{2}$/.test(g.slice(-6));
  const iso = hasTz ? g : `${g}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDeDdMmYyyy(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** order.date_created (Woo-Anzeige-Datum-String) → DD.MM.YYYY */
function orderDateBillingLabel(order: WooOrder): string {
  const s =
    typeof order.date_created === "string" ? order.date_created.trim() : "";
  if (s) {
    const isoLike = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)
      ? s.replace(" ", "T")
      : s;
    const d = new Date(isoLike);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d);
    }
  }
  return formatDeDdMmYyyy(parseCreatedUtc(order));
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildGreeting(order: WooOrder): string {
  const fn =
    typeof order.billing?.first_name === "string"
      ? order.billing.first_name.trim()
      : "";
  const co =
    typeof order.billing?.company === "string"
      ? order.billing.company.trim()
      : "";
  if (fn) return `Hallo ${fn},`;
  if (co) return "Hallo zusammen,";
  return "Guten Tag,";
}

function orderTotalEu(order: WooOrder): string {
  const raw = Number.parseFloat(String(order.total ?? "0"));
  const n = Number.isFinite(raw) ? raw : 0;
  return (
    "€ " +
    n.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function customerIsWholesale(c: WooCustomer): boolean {
  if (typeof c.role === "string" && c.role.trim().toLowerCase() === "wholesale") {
    return true;
  }
  if (
    Array.isArray(c.roles) &&
    c.roles.some(
      (r) => typeof r === "string" && r.trim().toLowerCase() === "wholesale"
    )
  ) {
    return true;
  }
  return false;
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

  const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
  const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY!;
  const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET!;
  const IBAN =
    typeof process.env.UNCUTTV_BANK_IBAN === "string"
      ? process.env.UNCUTTV_BANK_IBAN.trim()
      : "";
  const BIC =
    typeof process.env.UNCUTTV_BANK_BIC === "string"
      ? process.env.UNCUTTV_BANK_BIC.trim()
      : "";

  if (!WOOCOMMERCE_URL || !WOOCOMMERCE_KEY || !WOOCOMMERCE_SECRET) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "missing_woocommerce_env",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const basic =
    "Basic " +
    Buffer.from(`${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`).toString("base64");

  const errors: string[] = [];
  const ordersById = new Map<number, WooOrder>();

  for (const status of ORDER_STATUSES) {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const path = `/wp-json/wc/v3/orders?status=${encodeURIComponent(status)}&per_page=100&page=${page}`;
      const r = await fetch(
        `${WOOCOMMERCE_URL.replace(/\/$/, "")}${path}`,
        { headers: { Authorization: basic }, cache: "no-store" }
      );
      const totalPagesHeader = r.headers.get("x-wp-totalpages");
      const parsedTp = totalPagesHeader
        ? Number.parseInt(totalPagesHeader, 10)
        : 1;
      if (Number.isFinite(parsedTp) && parsedTp > 0) {
        totalPages = parsedTp;
      }
      const bodyText = await r.text();
      if (!r.ok) {
        const msg = `fetch_orders_fail status=${status} page=${page} http=${r.status} body=${bodyText.slice(0, 400)}`;
        errors.push(msg);
        if (page === 1) {
          return new Response(JSON.stringify({ ok: false, error: msg, errors }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        break;
      }
      let arr: unknown;
      try {
        arr = JSON.parse(bodyText) as unknown;
      } catch {
        errors.push(`orders_json_parse_fail status=${status} page=${page}`);
        break;
      }
      if (!Array.isArray(arr)) {
        errors.push(`orders_not_array status=${status} page=${page}`);
        break;
      }
      for (const item of arr) {
        const o = item as WooOrder;
        if (typeof o?.id === "number") {
          ordersById.set(o.id, o);
        }
      }
      page += 1;
    }
  }

  const allOrders = [...ordersById.values()];

  const roleCache = new Map<number, boolean>();
  async function cachedWholesale(id: number): Promise<boolean> {
    if (roleCache.has(id)) return Boolean(roleCache.get(id));
    const cr = await fetch(
      `${WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/customers/${encodeURIComponent(String(id))}`,
      { headers: { Authorization: basic }, cache: "no-store" }
    );
    let data: unknown;
    try {
      data = JSON.parse(await cr.text()) as unknown;
    } catch {
      errors.push(`customer_${id}_json_parse_${cr.status}`);
      roleCache.set(id, false);
      return false;
    }
    if (!cr.ok || !data || typeof data !== "object") {
      errors.push(`customer_${id}_fetch_${cr.status}`);
      roleCache.set(id, false);
      return false;
    }
    const c = data as WooCustomer;
    if (
      process.env.WHOLESALE_CRON_DEBUG_ROLE &&
      process.env.WHOLESALE_CRON_DEBUG_ROLE !== "false" &&
      process.env.WHOLESALE_CRON_DEBUG_ROLE !== "0"
    ) {
      console.log(
        "[wholesale-bank-reminders] woo customer probe",
        id,
        JSON.stringify({ role: c.role, roles: c.roles ?? null })
      );
    }
    const isW = customerIsWholesale(c);
    roleCache.set(id, isW);
    return isW;
  }

  const filtered: WooOrder[] = [];
  for (const o of allOrders) {
    const bank = metaValue(o.meta_data, "_uncuttv_payment_method") === "bank";
    const skip = hasMetaYes(o, "_uncuttv_skip_reminders");
    const custId =
      typeof o.customer_id === "number" &&
      Number.isFinite(o.customer_id) &&
      o.customer_id > 0
        ? o.customer_id
        : 0;
    const emailOk =
      typeof o.billing?.email === "string" && o.billing.email.includes("@");

    if (!bank || skip || custId <= 0 || !emailOk) continue;

    const isWs = await cachedWholesale(custId);
    if (isWs) filtered.push(o);
  }

  const reminders_sent = { day7: 0, day12: 0, day13: 0 };
  let cancelled = 0;
  let day14_emails = 0;

  const resend = resendConfigured() ? new Resend(process.env.RESEND_API_KEY) : null;

  async function sendCustomerMail(
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    if (!resend) {
      errors.push(`resend_skipped (${to.slice(0, 32)})`);
      return false;
    }
    const payload = {
      from: "UncutTV <office@uncuttv.at>",
      to,
      bcc: "office@uncuttv.at",
      reply_to: "office@uncuttv.at",
      subject,
      html,
    } as Record<string, unknown>;
    try {
      const { error } = await resend.emails.send(payload as never);
      if (error) {
        errors.push(`resend:${error.message ?? String(error)}`);
        return false;
      }
      return true;
    } catch (e) {
      errors.push(`resend_throw:${String(e)}`);
      return false;
    }
  }

  async function putReminderMeta(orderId: number, key: string): Promise<boolean> {
    const r = await fetch(
      `${WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${encodeURIComponent(String(orderId))}`,
      {
        method: "PUT",
        headers: {
          Authorization: basic,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meta_data: [{ key, value: "yes" }],
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      errors.push(`meta_${orderId}_${key}_fail_${r.status}:${t.slice(0, 200)}`);
      return false;
    }
    return true;
  }

  async function cancelAndNote(orderId: number): Promise<boolean> {
    const put = await fetch(
      `${WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${encodeURIComponent(String(orderId))}`,
      {
        method: "PUT",
        headers: {
          Authorization: basic,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      }
    );
    if (!put.ok) {
      const t = await put.text().catch(() => "");
      errors.push(`cancel_put_${orderId}_${put.status}:${t.slice(0, 200)}`);
      return false;
    }
    const note = await fetch(
      `${WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders/${encodeURIComponent(String(orderId))}/notes`,
      {
        method: "POST",
        headers: {
          Authorization: basic,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "Automatisch storniert nach 14 Tagen ohne Zahlungseingang.",
          customer_note: false,
        }),
      }
    );
    if (!note.ok) {
      const t = await note.text().catch(() => "");
      errors.push(`cancel_note_${orderId}_${note.status}:${t.slice(0, 200)}`);
      return false;
    }
    return true;
  }

  const haendlerUrl = "https://uncuttv.at/haendler";
  const now = new Date();

  for (const order of filtered) {
    try {
      const created = parseCreatedUtc(order);
      if (!created) {
        errors.push(`order_${order.id}_bad_date`);
        continue;
      }

      const daysOld = Math.floor(
        (now.getTime() - created.getTime()) / 86400000
      );
      const deadline = addUtcDays(created, 14);
      const deadlineStr = formatDeDdMmYyyy(deadline);

      const baseMail = {
        orderId: order.id,
        orderNumber: String(order.number ?? order.id),
        orderDate: orderDateBillingLabel(order),
        orderTotal: orderTotalEu(order),
        greeting: buildGreeting(order),
        iban: IBAN,
        bic: BIC,
        haendlerUrl,
        deadlineDate: deadlineStr,
        cancelDate: deadlineStr,
      };

      const mailData = baseMail as ReminderEmailData;

      if (daysOld >= 14) {
        const okCancel = await cancelAndNote(order.id);
        if (okCancel) {
          cancelled += 1;
          const tmpl = WHOLESALE_REMINDER_TEMPLATES.day14;
          const subj = tmpl.subject(order.id);
          const html = tmpl.html(mailData);
          if (
            await sendCustomerMail(order.billing!.email!, subj, html)
          ) {
            day14_emails += 1;
          }
        }
      } else if (
        daysOld >= 13 &&
        !hasMetaYes(order, "_uncuttv_reminder_sent_day_13")
      ) {
        const tmpl = WHOLESALE_REMINDER_TEMPLATES.day13;
        const subj = tmpl.subject(order.id);
        const html = tmpl.html(mailData);
        const sent = await sendCustomerMail(order.billing!.email!, subj, html);
        if (sent && (await putReminderMeta(order.id, "_uncuttv_reminder_sent_day_13"))) {
          reminders_sent.day13 += 1;
        }
      } else if (
        daysOld >= 12 &&
        !hasMetaYes(order, "_uncuttv_reminder_sent_day_12")
      ) {
        const tmpl = WHOLESALE_REMINDER_TEMPLATES.day12;
        const subj = tmpl.subject(order.id);
        const html = tmpl.html(mailData);
        const sent = await sendCustomerMail(order.billing!.email!, subj, html);
        if (sent && (await putReminderMeta(order.id, "_uncuttv_reminder_sent_day_12"))) {
          reminders_sent.day12 += 1;
        }
      } else if (
        daysOld >= 7 &&
        !hasMetaYes(order, "_uncuttv_reminder_sent_day_7")
      ) {
        const tmpl = WHOLESALE_REMINDER_TEMPLATES.day7;
        const subj = tmpl.subject(order.id);
        const html = tmpl.html(mailData);
        const sent = await sendCustomerMail(order.billing!.email!, subj, html);
        if (sent && (await putReminderMeta(order.id, "_uncuttv_reminder_sent_day_7"))) {
          reminders_sent.day7 += 1;
        }
      }
    } catch (e) {
      errors.push(`loop_order_${order.id}:${String(e)}`);
    }
  }

  const remindersSentTotal =
    reminders_sent.day7 + reminders_sent.day12 + reminders_sent.day13 + day14_emails;

  if (
    remindersSentTotal > 0 ||
    cancelled > 0
  ) {
    const snapshot = {
      ok: true as const,
      checked: ordersById.size,
      filtered_wholesale_bank: filtered.length,
      reminders_sent,
      cancelled,
      day14_emails,
      errors,
    };
    if (resend) {
      try {
        await resend.emails.send({
          from: "UncutTV Cron <office@uncuttv.at>",
          to: "office@uncuttv.at",
          subject: `[Wholesale-Cron] ${remindersSentTotal} Reminders, ${cancelled} Storno`,
          html: `<pre>${escForPre(JSON.stringify(snapshot, null, 2))}</pre>`,
        } as never);
      } catch (e) {
        errors.push(`summary_mail:${String(e)}`);
      }
    }
  }

  const bodyOut = {
    ok: true,
    checked: ordersById.size,
    filtered_wholesale_bank: filtered.length,
    reminders_sent,
    cancelled,
    errors,
  };

  return new Response(JSON.stringify(bodyOut), {
    headers: { "Content-Type": "application/json" },
  });
}

function escForPre(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
