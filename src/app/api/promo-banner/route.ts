import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface PromoItem {
  image: string;
  label: string;
}

export interface PromoData {
  active: boolean;
  title: string;
  subtitle: string;
  label: string;
  image: string;
  link: string;
  ctaText: string;
  items: PromoItem[];
}

interface BannerRow {
  active: boolean;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  cta_text: string | null;
  link: string | null;
  items: PromoItem[] | null;
}

const INACTIVE_DEFAULT: PromoData = {
  active: false,
  title: "",
  subtitle: "",
  label: "",
  image: "",
  link: "",
  ctaText: "",
  items: [],
};

function mapRowToPromoData(row: BannerRow): PromoData {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    active: row.active,
    title: row.title ?? "",
    subtitle: row.subtitle ?? "",
    label: row.label ?? "",
    image: items[0]?.image ?? "",
    link: row.link ?? "",
    ctaText: row.cta_text ?? "",
    items,
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(INACTIVE_DEFAULT);
  }

  const { data, error } = await supabase
    .from("banners")
    .select("active, label, title, subtitle, cta_text, link, items")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(INACTIVE_DEFAULT);
  }

  return NextResponse.json(mapRowToPromoData(data as BannerRow));
}
