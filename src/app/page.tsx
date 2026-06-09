import { redirect } from "next/navigation";

type HomeSearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<HomeSearchParams>;
}

function toQueryString(params: HomeSearchParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) qs.append(key, entry);
    } else {
      qs.set(key, value);
    }
  }
  return qs.toString();
}

export default async function Home({ searchParams }: PageProps) {
  const queryString = toQueryString(await searchParams);
  redirect(queryString ? `/shop?${queryString}` : "/shop");
}
