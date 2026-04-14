import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "data", "promo-banner.json");

interface PromoItem {
  image: string;
  label: string;
}

interface PromoData {
  active: boolean;
  title: string;
  subtitle: string;
  label: string;
  image: string;
  link: string;
  ctaText: string;
  items: PromoItem[];
}

const DEFAULT_DATA: PromoData = {
  active: true,
  title: "GROSSER VORVERKAUF",
  subtitle: "3 Neue Mediabooks · Ab €34.90",
  label: "NEU IM VORVERKAUF",
  image: "",
  link: "/shop?kategorie=vorverkauf",
  ctaText: "JETZT VORBESTELLEN",
  items: [],
};

async function readPromo(): Promise<PromoData> {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return DEFAULT_DATA;
  }
}

export async function GET() {
  const data = await readPromo();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<PromoData>;
    const current = await readPromo();
    const updated = { ...current, ...body };
    await writeFile(DATA_PATH, JSON.stringify(updated, null, 2), "utf-8");
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
