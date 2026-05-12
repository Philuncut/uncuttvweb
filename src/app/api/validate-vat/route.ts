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

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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

async function callVies(
  countryCode: string,
  vatNumber: string
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
  const timer = setTimeout(() => controller.abort(), 5000);
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
  const requestDate = pickSimpleTag(xml, "requestDate") ?? "";
  const consultationNumber =
    pickSimpleTag(xml, "requestIdentifier") ??
    pickSimpleTag(xml, "consultationNumber") ??
    "";
  const nameRaw = pickMultilineTag(xml, "name");
  const addressRaw = pickMultilineTag(xml, "address");

  if (valid) {
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
      return NextResponse.json(cached);
    }

    const vies = await callVies(split.countryCode, split.vatNumber);
    if (!vies.ok) {
      if (vies.reason === "timeout") {
        return NextResponse.json({
          valid: null,
          error: "vies_timeout",
        } satisfies ValidateVatResponse);
      }
      if (vies.reason === "fault") {
        console.error("[validate-vat] VIES SOAP fault for", cacheKey);
      }
      return NextResponse.json({
        valid: null,
        error: "vies_unavailable",
      } satisfies ValidateVatResponse);
    }

    const parsed = parseViesXml(vies.xml);
    if (parsed.valid === true || parsed.valid === false) {
      viesCacheSet(cacheKey, parsed);
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("[validate-vat]", e);
    return NextResponse.json(
      { valid: null, error: "vies_unavailable" } satisfies ValidateVatResponse,
      { status: 500 }
    );
  }
}
