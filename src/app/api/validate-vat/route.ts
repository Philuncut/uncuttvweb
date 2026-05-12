import { NextResponse } from "next/server";
import { normalizeEuVat, validateEuVatFormat } from "@/lib/vat-format";
import { VIES_SUPPORTED_PREFIXES } from "@/lib/reverse-charge";
import { viesCacheGet, viesCacheSet } from "@/lib/vies-cache";
import type { ValidateVatResponse, ViesValidated } from "@/lib/vies-types";

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

function looseFormatAllowsVies(normalized: string): boolean {
  if (normalized.length < 6 || normalized.length > 28) return false;
  const cc = normalized.slice(0, 2);
  if (!VIES_SUPPORTED_PREFIXES.has(cc)) return false;
  return /^[A-Z]{2}[A-Z0-9.+]{4,24}$/.test(normalized);
}

function splitVatForVies(
  normalized: string
): { countryCode: string; vatNumber: string } | null {
  if (normalized.startsWith("CHE")) return null;
  if (normalized.startsWith("ATU") && /^ATU\d{8}$/.test(normalized)) {
    return { countryCode: "AT", vatNumber: normalized.slice(2) };
  }
  const cc = normalized.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const rest = normalized.slice(2);
  if (rest.length < 2) return null;
  return { countryCode: cc, vatNumber: rest };
}

/** Standard VIES checkVat XML has no requestIdentifier; legacy cache may still omit consultationNumber. */
function ensureConsultationNumber(
  parsed: ValidateVatResponse,
  split: { countryCode: string; vatNumber: string }
): ValidateVatResponse {
  if (parsed.valid !== true) return parsed;
  if (parsed.consultationNumber.trim()) return parsed;
  const rd = parsed.requestDate?.trim() || new Date().toISOString();
  return {
    ...parsed,
    consultationNumber: `checkVat:${split.countryCode}:${split.vatNumber}:${rd}`,
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** VIES often wraps trader name/address in CDATA. */
function stripCdata(s: string): string {
  const t = s.trim();
  if (!t.toUpperCase().startsWith("<![CDATA[")) return s.trim();
  const end = t.indexOf("]]>");
  if (end === -1) return s.trim();
  return t.slice("<![CDATA[".length, end).trim();
}

function pickSimpleTag(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${localName}\\s*>([^<]*)</(?:[a-zA-Z0-9]+:)?${localName}\\s*>`,
    "i"
  );
  const m = xml.match(re);
  return m?.[1] != null ? decodeXml(m[1].trim()) : null;
}

function pickMultilineTag(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${localName}\\s*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${localName}\\s*>`,
    "i"
  );
  const m = xml.match(re);
  if (m?.[1] == null) return null;
  const t = decodeXml(m[1].replace(/\s+/g, " ").trim());
  return t || null;
}

function hasSoapFault(xml: string): boolean {
  return /<(?:\w+:)?Fault[\s>]/i.test(xml) || /<faultcode>/i.test(xml);
}

async function callViesWithTimeout(
  countryCode: string,
  vatNumber: string,
  timeoutMs: number
): Promise<
  { ok: true; xml: string } | { ok: false; reason: "fault" | "network" | "timeout" }
> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
<soapenv:Body>
<urn:checkVat>
<urn:countryCode>${countryCode}</urn:countryCode>
<urn:vatNumber>${vatNumber}</urn:vatNumber>
</urn:checkVat>
</soapenv:Body>
</soapenv:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(VIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: "",
      },
      body: envelope,
      signal: controller.signal,
    });
    const xml = await res.text();
    if (!res.ok) return { ok: false, reason: "network" };
    if (hasSoapFault(xml)) return { ok: false, reason: "fault" };
    return { ok: true, xml };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function parseViesXml(xml: string): ValidateVatResponse {
  const validStr = pickSimpleTag(xml, "valid");
  if (!validStr) {
    return { valid: null, error: "vies_unavailable" };
  }
  const valid = validStr === "true";
  const country = pickSimpleTag(xml, "countryCode");
  const vatNumberFromXml = pickSimpleTag(xml, "vatNumber");
  const requestDate = pickSimpleTag(xml, "requestDate") ?? "";
  let consultationNumber =
    pickSimpleTag(xml, "requestIdentifier") ??
    pickSimpleTag(xml, "consultationNumber") ??
    "";
  const nameRaw0 = pickMultilineTag(xml, "name");
  const addressRaw0 = pickMultilineTag(xml, "address");
  const nameRaw = nameRaw0 != null ? stripCdata(nameRaw0) : null;
  const addressRaw = addressRaw0 != null ? stripCdata(addressRaw0) : null;

  if (valid) {
    if (!consultationNumber.trim()) {
      const cc = (country ?? "").trim();
      const vn = (vatNumberFromXml ?? "").trim();
      const rd = (requestDate ?? "").trim() || new Date().toISOString();
      consultationNumber = `checkVat:${cc}:${vn}:${rd}`;
    }
    const out: ViesValidated = {
      valid: true,
      country: country || null,
      name: nameRaw && nameRaw !== "---" ? nameRaw : null,
      address: addressRaw && addressRaw !== "---" ? addressRaw : null,
      requestDate: requestDate || new Date().toISOString(),
      consultationNumber,
    };
    return out;
  }
  return { valid: false };
}

const VIES_FETCH_TIMEOUT_MS = 12_000;
const VIES_MAX_ATTEMPTS = 3;

type RetryableViesError = Extract<
  ValidateVatResponse,
  { valid: null }
>["error"];

async function fetchViesWithRetries(
  countryCode: string,
  vatNumber: string
): Promise<ValidateVatResponse> {
  let lastError: RetryableViesError = "vies_unavailable";

  for (let attempt = 1; attempt <= VIES_MAX_ATTEMPTS; attempt++) {
    const transport = await callViesWithTimeout(
      countryCode,
      vatNumber,
      VIES_FETCH_TIMEOUT_MS
    );

    if (!transport.ok) {
      lastError =
        transport.reason === "timeout" ? "vies_timeout" : "vies_unavailable";
      if (transport.reason === "fault") {
        console.error(
          "[validate-vat] VIES SOAP fault for",
          `${countryCode}|${vatNumber}`,
          "attempt",
          attempt
        );
      }
    } else {
      const parsed = parseViesXml(transport.xml);
      if (parsed.valid === true || parsed.valid === false) {
        return parsed;
      }
      lastError = parsed.error;
    }

    if (attempt < VIES_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return { valid: null, error: lastError };
}

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as { vat?: string };
    const normalized = normalizeEuVat(json.vat ?? "");
    if (!normalized || normalized.length < 4) {
      return NextResponse.json({ valid: false } satisfies ValidateVatResponse);
    }

    if (
      !validateEuVatFormat(normalized) &&
      !looseFormatAllowsVies(normalized)
    ) {
      return NextResponse.json({ valid: false } satisfies ValidateVatResponse);
    }

    const split = splitVatForVies(normalized);
    if (!split) {
      return NextResponse.json({ valid: false } satisfies ValidateVatResponse);
    }

    const cacheKey = `${split.countryCode}|${split.vatNumber}`;
    const cached = viesCacheGet(cacheKey);
    if (cached) {
      const patched = ensureConsultationNumber(cached, split);
      console.log(
        "[validate-vat] returning (cache):",
        JSON.stringify(patched)
      );
      return NextResponse.json(patched);
    }

    const parsed = await fetchViesWithRetries(
      split.countryCode,
      split.vatNumber
    );
    const patched = ensureConsultationNumber(parsed, split);
    if (patched.valid === true || patched.valid === false) {
      viesCacheSet(cacheKey, patched);
    }
    console.log("[validate-vat] returning:", JSON.stringify(patched));
    return NextResponse.json(patched);
  } catch (e) {
    console.error("[validate-vat]", e);
    return NextResponse.json(
      { valid: null, error: "vies_unavailable" } satisfies ValidateVatResponse,
      { status: 500 }
    );
  }
}
