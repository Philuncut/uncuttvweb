"use client";

type FbqEvent =
  | "PageView" | "ViewContent" | "AddToCart"
  | "InitiateCheckout" | "Purchase" | "Search" | "Lead";

interface FbqParams {
  content_name?: string;
  content_ids?: string[];
  content_type?: "product" | "product_group";
  value?: number;
  currency?: string;
  num_items?: number;
  search_string?: string;
  event_id?: string;
}

function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("cookie_consent") === "all";
  } catch {
    return false;
  }
}

function generateEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function fbqTrack(event: FbqEvent, params?: FbqParams): string {
  const eventId = params?.event_id ?? generateEventId();

  if (typeof window === "undefined") return eventId;
  if (!hasConsent()) return eventId;

  const { event_id, ...rest } = params ?? {};

  const trackEvent = () => {
    const fbq = (window as any).fbq;
    if (fbq) {
      fbq("consent", "grant");
      fbq("track", event, rest, { eventID: eventId });
    }
  };

  if ((window as any).fbq) {
    trackEvent();
  } else {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if ((window as any).fbq) {
        trackEvent();
        clearInterval(interval);
      } else if (attempts > 20) {
        console.warn("[fbqTrack] fbq not available after 1s, dropping:", event);
        clearInterval(interval);
      }
    }, 50);
  }

  return eventId;
}

export async function fbqTrackDual(event: FbqEvent, params?: FbqParams): Promise<string> {
  const eventId = fbqTrack(event, params);

  if (!hasConsent()) return eventId;

  fetch("/api/meta-capi/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: event,
      event_id: eventId,
      event_source_url: window.location.href,
      custom_data: params,
    }),
  }).catch(err => console.error("[CAPI] dual-track failed:", err));

  return eventId;
}

export function trackViewContent(productId: string, name: string, price: number) {
  return fbqTrack("ViewContent", {
    content_ids: [productId],
    content_name: name,
    content_type: "product",
    value: price,
    currency: "EUR",
  });
}

export function trackAddToCart(productId: string, name: string, price: number, qty: number = 1) {
  return fbqTrackDual("AddToCart", {
    content_ids: [productId],
    content_name: name,
    content_type: "product",
    value: price * qty,
    currency: "EUR",
    num_items: qty,
  });
}

export function trackInitiateCheckout(totalValue: number, numItems: number, productIds: string[]) {
  return fbqTrackDual("InitiateCheckout", {
    content_ids: productIds,
    content_type: "product",
    value: totalValue,
    currency: "EUR",
    num_items: numItems,
  });
}

export function trackPurchase(orderId: string, totalValue: number, productIds: string[]) {
  return fbqTrack("Purchase", {
    content_ids: productIds,
    content_type: "product",
    value: totalValue,
    currency: "EUR",
    event_id: orderId,
  });
}

export function trackSearch(query: string) {
  return fbqTrack("Search", { search_string: query });
}

export function trackLead(eventName: string) {
  return fbqTrack("Lead", { content_name: eventName });
}
