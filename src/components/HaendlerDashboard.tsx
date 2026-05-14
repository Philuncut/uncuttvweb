"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchInput from "@/components/SearchInput";
import CinematicLoader from "@/components/CinematicLoader";
import { useLanguage } from "@/lib/LanguageContext";
import {
  HAENDLER_ALLE_FILME_CATEGORY_SLUGS,
  productHasExactCategorySlug,
  productHasOutOfPrintCategory,
} from "@/lib/haendler-filter";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";
import { createT } from "@/lib/translations";
import type { WooCategory } from "@/lib/types";
import { ProductCardQuickAdd } from "@/components/ProductCardQuickAdd";
import {
  toHaendlerCartProduct,
  type HaendlerDashboardProductRow,
} from "@/lib/haendler-to-cart-product";

interface HaendlerProduct extends HaendlerDashboardProductRow {}

interface Order {
  id: number;
  number: string;
  date_created: string;
  status: string;
  total: string;
  line_items: Array<{ name: string; quantity: number }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    processing: { label: "VERARBEITUNG", cls: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50" },
    completed: { label: "ABGESCHLOSSEN", cls: "bg-green-900/40 text-green-400 border border-green-800/50" },
    pending: { label: "AUSSTEHEND", cls: "bg-white/5 text-white/40 border border-white/10" },
  };
  const s = map[status] || { label: status.toUpperCase(), cls: "bg-white/5 text-white/40 border border-white/10" };
  return <span className={`inline-block px-2 py-0.5 text-[9px] font-bold tracking-wider ${s.cls}`}>{s.label}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-l-4 border-[#c0392b] pl-3 text-lg font-black tracking-[0.15em] text-white sm:text-xl">
      {children}
    </h2>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-[#333] bg-[#111] px-3 py-2.5 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

function ProductCard({ product }: { product: HaendlerProduct }) {
  const { language } = useLanguage();
  const t = createT(language);
  const image = product.images[0]?.src;
  const isOutOfStock = product.stock_status === "outofstock";
  const hasHaendlerPreis = !!product.haendler_preis?.trim();
  const [cardFlash, setCardFlash] = useState(false);

  const productForCart = useMemo(() => toHaendlerCartProduct(product), [product]);

  const triggerCardFlash = useCallback(() => {
    setCardFlash(true);
    window.setTimeout(() => setCardFlash(false), 300);
  }, []);

  const showQuickAdd = !isOutOfStock && hasHaendlerPreis;

  return (
    <Link href={`/haendler/produkt/${product.slug}`} className="group block">
      <div
        className={`relative aspect-square overflow-hidden bg-[#111] transition-shadow duration-300 ${
          cardFlash
            ? "shadow-[0_0_20px_rgba(192,57,43,0.6)]"
            : "group-hover:shadow-[0_0_20px_rgba(192,57,43,0.5)]"
        } ${isOutOfStock ? "opacity-60 grayscale" : ""}`}
      >
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            NO IMAGE
          </div>
        )}
        {isOutOfStock && (
          <span className="absolute top-3 left-3 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-wider text-white/50">
            AUSVERKAUFT
          </span>
        )}
        {showQuickAdd && (
          <ProductCardQuickAdd
            productForCart={productForCart}
            onCardFlash={triggerCardFlash}
          />
        )}
      </div>
      <div className="mt-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white/90">
          {product.name}
        </h3>
        {hasHaendlerPreis ? (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-sm font-bold text-[#c0392b]">
              {formatPrice(parsePrice(product.haendler_preis))}
            </span>
            <span className="text-xs text-white/30 line-through">
              {formatPrice(parsePrice(product.price))}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-white/30">{t("PREIS_AUF_ANFRAGE")}</p>
        )}
      </div>
    </Link>
  );
}

function ExpandableSection({
  title,
  products,
  defaultRows,
}: {
  title: string;
  products: HaendlerProduct[];
  defaultRows: number;
}) {
  const { language } = useLanguage();
  const t = createT(language);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  const defaultCount = Math.max(defaultRows * 4, defaultRows * 2);
  const visibleProducts = expanded ? products : products.slice(0, defaultCount);
  const canExpand = products.length > defaultCount;

  const measureHeight = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    measureHeight();
  }, [expanded, measureHeight]);

  useEffect(() => {
    window.addEventListener("resize", measureHeight);
    return () => window.removeEventListener("resize", measureHeight);
  }, [measureHeight]);

  if (products.length === 0) return null;

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div
        style={{
          height: contentHeight !== undefined ? contentHeight : "auto",
          transition: "height 0.4s ease",
          overflow: "hidden",
        }}
      >
        <div ref={contentRef}>
          <div className="mt-6 grid grid-cols-2 gap-4 px-3 sm:gap-6 sm:px-5 lg:grid-cols-4 lg:px-6">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </div>
      {canExpand && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="cursor-pointer border border-[#c0392b] bg-transparent px-8 py-3 text-xs font-bold tracking-wider text-[#c0392b] transition-colors duration-200 hover:bg-[#c0392b] hover:text-white"
          >
            {expanded ? t("WENIGER_ANZEIGEN") : t("MEHR_ANZEIGEN")}
          </button>
        </div>
      )}
    </section>
  );
}

const HAENDLER_DASHBOARD_SEEN_KEY = "haendler_dashboard_seen";

function DashboardLoadSkeleton() {
  return (
    <div className="min-h-[50vh] animate-pulse space-y-6" aria-hidden>
      <div className="h-9 w-2/3 max-w-sm rounded bg-white/10" />
      <div className="h-10 w-full max-w-md rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square rounded bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function InvoiceButton({ orderId, orderNumber }: { orderId: number; orderNumber: string }) {
  const [loading, setLoading] = useState(false);

  const download = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/haendler/invoice?order_id=${orderId}`);
      if (!res.ok) {
        console.error("Invoice download failed");
        setLoading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rechnung-RE-${orderNumber}-2026.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      console.error("Invoice download error");
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNumber]);

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className="cursor-pointer border border-[#c0392b] bg-transparent p-1.5 text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-50"
      aria-label={`Rechnung für Bestellung #${orderNumber} herunterladen`}
      title="Rechnung herunterladen"
    >
      {loading ? (
        <div className="h-4 w-4 animate-spin border-2 border-[#c0392b] border-t-transparent" />
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="square" d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" />
        </svg>
      )}
    </button>
  );
}

interface CustomerMeta {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  uidNummer: string;
  billingStreet: string;
  billingCity: string;
  billingZip: string;
  billingCountry: string;
  billingPhone: string;
  shippingStreet: string;
  shippingCity: string;
  shippingZip: string;
  shippingCountry: string;
}

export default function HaendlerDashboard() {
  const router = useRouter();
  const [showIntro] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(HAENDLER_DASHBOARD_SEEN_KEY) !== "1";
  });
  const [products, setProducts] = useState<HaendlerProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { language } = useLanguage();
  const t = createT(language);

  // Customer data
  const [customer, setCustomer] = useState<CustomerMeta | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showCompanyWarning, setShowCompanyWarning] = useState(false);

  // Edit fields
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editUid, setEditUid] = useState("");
  const [editBillingStreet, setEditBillingStreet] = useState("");
  const [editBillingCity, setEditBillingCity] = useState("");
  const [editBillingZip, setEditBillingZip] = useState("");
  const [editBillingCountry, setEditBillingCountry] = useState("AT");
  const [editPhone, setEditPhone] = useState("");
  const [editShipStreet, setEditShipStreet] = useState("");
  const [editShipCity, setEditShipCity] = useState("");
  const [editShipZip, setEditShipZip] = useState("");
  const [editShipCountry, setEditShipCountry] = useState("AT");
  const [shipSameAsBilling, setShipSameAsBilling] = useState(true);

  useEffect(() => {
    async function load() {
      const tokenCheck = await fetch("/api/haendler/products");
      if (!tokenCheck.ok) {
        router.push("/haendler");
        return;
      }

      const prods = await tokenCheck.json();
      setProducts(prods);

      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setUserName(meData.firstName || "Händler");
          setOrders(meData.orders || []);

          // Extract UID from meta_data if present
          const meta = meData.meta_data || [];
          const uidMeta = meta.find?.((m: { key: string }) => m.key === "uid_nummer");

          const c: CustomerMeta = {
            firstName: meData.firstName || "",
            lastName: meData.lastName || "",
            email: meData.email || "",
            company: meData.billing?.company || "",
            uidNummer: uidMeta?.value || "",
            billingStreet: meData.billing?.address_1 || "",
            billingCity: meData.billing?.city || "",
            billingZip: meData.billing?.postcode || "",
            billingCountry: meData.billing?.country || "AT",
            billingPhone: meData.billing?.phone || "",
            shippingStreet: meData.shipping?.address_1 || "",
            shippingCity: meData.shipping?.city || "",
            shippingZip: meData.shipping?.postcode || "",
            shippingCountry: meData.shipping?.country || "AT",
          };
          setCustomer(c);

          // Init edit fields
          setEditFirst(c.firstName);
          setEditLast(c.lastName);
          setEditCompany(c.company);
          setEditUid(c.uidNummer);
          setEditBillingStreet(c.billingStreet);
          setEditBillingCity(c.billingCity);
          setEditBillingZip(c.billingZip);
          setEditBillingCountry(c.billingCountry);
          setEditPhone(c.billingPhone);
          setEditShipStreet(c.shippingStreet);
          setEditShipCity(c.shippingCity);
          setEditShipZip(c.shippingZip);
          setEditShipCountry(c.shippingCountry);

          const sameAddr =
            !c.shippingStreet ||
            (c.shippingStreet === c.billingStreet &&
              c.shippingCity === c.billingCity &&
              c.shippingZip === c.billingZip);
          setShipSameAsBilling(sameAddr);
        }
      } catch {
        // Orders are optional
      }

      if (typeof window !== "undefined" && showIntro) {
        sessionStorage.setItem(HAENDLER_DASHBOARD_SEEN_KEY, "1");
      }
      setLoading(false);
    }
    load();
  }, [router, showIntro]);

  useEffect(() => {
    async function loadProfileWarning() {
      try {
        const res = await fetch("/api/auth/profile");
        if (!res.ok) return;
        const data = await res.json();
        const missingCompany = !String(data?.billing?.company || "").trim();
        const missingVat = !String(data?.billing?.vat || "").trim();
        setShowCompanyWarning(missingCompany || missingVat);
      } catch {
        // keep dashboard usable even if profile endpoint fails
      }
    }

    void loadProfileWarning();
  }, []);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setSaveMsg("");

      const shipAddr = shipSameAsBilling
        ? {
            first_name: editFirst,
            last_name: editLast,
            company: editCompany,
            address_1: editBillingStreet,
            city: editBillingCity,
            postcode: editBillingZip,
            country: editBillingCountry,
          }
        : {
            first_name: editFirst,
            last_name: editLast,
            company: editCompany,
            address_1: editShipStreet,
            city: editShipCity,
            postcode: editShipZip,
            country: editShipCountry,
          };

      const payload = {
        first_name: editFirst,
        last_name: editLast,
        billing: {
          first_name: editFirst,
          last_name: editLast,
          company: editCompany,
          address_1: editBillingStreet,
          city: editBillingCity,
          postcode: editBillingZip,
          country: editBillingCountry,
          phone: editPhone,
        },
        shipping: shipAddr,
        meta_data: [{ key: "uid_nummer", value: editUid }],
      };

      const res = await fetch("/api/auth/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setCustomer((prev) =>
          prev
            ? {
                ...prev,
                firstName: editFirst,
                lastName: editLast,
                company: editCompany,
                uidNummer: editUid,
                billingStreet: editBillingStreet,
                billingCity: editBillingCity,
                billingZip: editBillingZip,
                billingCountry: editBillingCountry,
                billingPhone: editPhone,
                shippingStreet: shipSameAsBilling ? editBillingStreet : editShipStreet,
                shippingCity: shipSameAsBilling ? editBillingCity : editShipCity,
                shippingZip: shipSameAsBilling ? editBillingZip : editShipZip,
                shippingCountry: shipSameAsBilling ? editBillingCountry : editShipCountry,
              }
            : prev
        );
        setEditing(false);
        setSaveMsg("Daten gespeichert.");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg("Fehler beim Speichern.");
      }
      setSaving(false);
    },
    [editFirst, editLast, editCompany, editUid, editBillingStreet, editBillingCity, editBillingZip, editBillingCountry, editPhone, editShipStreet, editShipCity, editShipZip, editShipCountry, shipSameAsBilling]
  );

  // Optional client-side guard (API liefert bereits gefiltert): keine OOP-Kategorie
  const availableProducts = useMemo(
    () => products.filter((p) => !productHasOutOfPrintCategory(p)),
    [products]
  );

  const vorverkauf = useMemo(
    () =>
      availableProducts.filter((p) =>
        productHasExactCategorySlug(p, "vorverkauf")
      ),
    [availableProducts]
  );

  const brandneu = useMemo(
    () =>
      availableProducts.filter((p) =>
        productHasExactCategorySlug(p, "brandneu")
      ),
    [availableProducts]
  );

  const alleFilme = useMemo(
    () =>
      availableProducts.filter((p) =>
        HAENDLER_ALLE_FILME_CATEGORY_SLUGS.some((slug) =>
          productHasExactCategorySlug(p, slug)
        )
      ),
    [availableProducts]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return availableProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [availableProducts, search]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/haendler/logout", { method: "POST" });
    window.dispatchEvent(new Event("uncuttv:session-changed"));
    router.push("/haendler");
  }, [router]);

  if (loading) {
    if (showIntro) {
      return <CinematicLoader show />;
    }
    return <DashboardLoadSkeleton />;
  }

  return (
    <div className="space-y-14">
      {/* Greeting */}
      {showCompanyWarning && (
        <div className="flex items-start justify-between gap-4 border border-[#c0392b] bg-[#3a1310] px-4 py-3 text-sm text-white">
          <p>
            <span className="font-bold">
              ⚠ Bitte vervollständige deine Firmendaten (Firmenname + UID) —
              ohne diese können wir keine korrekte Rechnung ausstellen.
            </span>{" "}
            <Link href="/konto" className="underline underline-offset-2">
              Jetzt vervollständigen
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setShowCompanyWarning(false)}
            className="cursor-pointer text-white/70 transition-colors hover:text-white"
            aria-label="Warnung schließen"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
          {t("WILLKOMMEN")}, {userName.toUpperCase()}
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer border border-[#333] bg-transparent px-6 py-2 text-xs font-bold tracking-wider text-white/50 transition-colors hover:border-[#c0392b] hover:text-white"
        >
          {t("ABMELDEN")}
        </button>
      </div>

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} />

      {searchResults !== null ? (
        <>
          <div className="grid grid-cols-2 gap-4 px-3 sm:gap-6 sm:px-5 lg:grid-cols-4 lg:px-6">
            {searchResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {searchResults.length === 0 && (
            <p className="py-10 text-center text-sm text-white/30">
              {t("KEINE_ERGEBNISSE")}
            </p>
          )}
        </>
      ) : (
        <>
      {/* Section A — Vorverkauf */}
      <ExpandableSection
        title={t("VORVERKAUF")}
        products={vorverkauf}
        defaultRows={2}
      />

      {/* Section B — Brandneu */}
      <ExpandableSection
        title={t("BRANDNEU")}
        products={brandneu}
        defaultRows={1}
      />

      {/* Section C — Alle Filme */}
      <ExpandableSection
        title={t("ALLE_FILME")}
        products={alleFilme}
        defaultRows={3}
      />
        </>
      )}

      {/* Meine Daten */}
      {customer && (
        <section>
          <SectionTitle>MEINE DATEN</SectionTitle>
          {saveMsg && (
            <p className={`mt-3 text-xs ${saveMsg.includes("Fehler") ? "text-[#c0392b]" : "text-green-400"}`}>
              {saveMsg}
            </p>
          )}

          {editing ? (
            <form onSubmit={handleSave} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>VORNAME</FieldLabel>
                  <Input value={editFirst} onChange={setEditFirst} />
                </div>
                <div>
                  <FieldLabel>NACHNAME</FieldLabel>
                  <Input value={editLast} onChange={setEditLast} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>FIRMA</FieldLabel>
                  <Input value={editCompany} onChange={setEditCompany} placeholder="Muster GmbH" />
                </div>
                <div>
                  <FieldLabel>UID-NUMMER</FieldLabel>
                  <Input value={editUid} onChange={setEditUid} placeholder="ATU12345678" />
                </div>
              </div>

              <h3 className="pt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
                RECHNUNGSANSCHRIFT
              </h3>
              <div>
                <FieldLabel>STRASSE + HAUSNUMMER</FieldLabel>
                <Input value={editBillingStreet} onChange={setEditBillingStreet} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel>PLZ</FieldLabel>
                  <Input value={editBillingZip} onChange={setEditBillingZip} />
                </div>
                <div>
                  <FieldLabel>ORT</FieldLabel>
                  <Input value={editBillingCity} onChange={setEditBillingCity} />
                </div>
                <div>
                  <FieldLabel>LAND</FieldLabel>
                  <select
                    value={editBillingCountry}
                    onChange={(e) => setEditBillingCountry(e.target.value)}
                    className="w-full border border-[#333] bg-[#111] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c0392b]"
                  >
                    <option value="AT">Österreich</option>
                    <option value="DE">Deutschland</option>
                    <option value="CH">Schweiz</option>
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>TELEFON</FieldLabel>
                <Input value={editPhone} onChange={setEditPhone} />
              </div>

              <label className="flex cursor-pointer items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  checked={shipSameAsBilling}
                  onChange={(e) => setShipSameAsBilling(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[#c0392b]"
                />
                <span className="text-xs text-white/50">
                  Lieferanschrift = Rechnungsanschrift
                </span>
              </label>

              {!shipSameAsBilling && (
                <>
                  <h3 className="pt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
                    LIEFERANSCHRIFT
                  </h3>
                  <div>
                    <FieldLabel>STRASSE + HAUSNUMMER</FieldLabel>
                    <Input value={editShipStreet} onChange={setEditShipStreet} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <FieldLabel>PLZ</FieldLabel>
                      <Input value={editShipZip} onChange={setEditShipZip} />
                    </div>
                    <div>
                      <FieldLabel>ORT</FieldLabel>
                      <Input value={editShipCity} onChange={setEditShipCity} />
                    </div>
                    <div>
                      <FieldLabel>LAND</FieldLabel>
                      <select
                        value={editShipCountry}
                        onChange={(e) => setEditShipCountry(e.target.value)}
                        className="w-full border border-[#333] bg-[#111] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c0392b]"
                      >
                        <option value="AT">Österreich</option>
                        <option value="DE">Deutschland</option>
                        <option value="CH">Schweiz</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer bg-[#c0392b] px-6 py-3 text-xs font-bold tracking-wider text-white transition-colors hover:bg-[#e74c3c] disabled:opacity-60"
                >
                  {saving ? "..." : "SPEICHERN"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="cursor-pointer border border-[#333] bg-transparent px-6 py-3 text-xs font-bold tracking-wider text-white/50 transition-colors hover:text-white"
                >
                  ABBRECHEN
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-white/60">
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">FIRMA: </span>
                <span className="text-white/80">{customer.company || "—"}</span>
              </p>
              {customer.uidNummer && (
                <p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">UID: </span>
                  <span className="text-white/80">{customer.uidNummer}</span>
                </p>
              )}
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">NAME: </span>
                <span className="text-white/80">{customer.firstName} {customer.lastName}</span>
              </p>
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">E-MAIL: </span>
                <span className="text-white/80">{customer.email}</span>
              </p>
              {customer.billingStreet && (
                <p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">RECHNUNGSANSCHRIFT: </span>
                  <span className="text-white/80">
                    {customer.billingStreet}, {customer.billingZip} {customer.billingCity}, {customer.billingCountry}
                  </span>
                </p>
              )}
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">LIEFERANSCHRIFT: </span>
                <span className="text-white/80">
                  {customer.shippingStreet && customer.shippingStreet !== customer.billingStreet
                    ? `${customer.shippingStreet}, ${customer.shippingZip} ${customer.shippingCity}, ${customer.shippingCountry}`
                    : "= Rechnungsanschrift"}
                </span>
              </p>
              {customer.billingPhone && (
                <p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">TELEFON: </span>
                  <span className="text-white/80">{customer.billingPhone}</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 cursor-pointer border border-[#c0392b] bg-transparent px-6 py-2.5 text-xs font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white"
              >
                BEARBEITEN
              </button>
            </div>
          )}
        </section>
      )}

      {/* Orders */}
      {orders.length > 0 && (
        <section>
          <SectionTitle>{t("MEINE_BESTELLUNGEN")}</SectionTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#222] text-[10px] font-bold uppercase tracking-wider text-white/40">
                  <th className="pb-3 pr-4">NR.</th>
                  <th className="pb-3 pr-4">DATUM</th>
                  <th className="pb-3 pr-4">PRODUKTE</th>
                  <th className="pb-3 pr-4">BETRAG</th>
                  <th className="pb-3 pr-4">STATUS</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const canDownload =
                    order.status === "completed" || order.status === "processing";
                  return (
                    <tr key={order.id} className="border-b border-[#1a1a1a]">
                      <td className="py-3 pr-4 font-bold text-white/70">#{order.number}</td>
                      <td className="py-3 pr-4 text-white/50">
                        {new Date(order.date_created).toLocaleDateString("de-AT")}
                      </td>
                      <td className="py-3 pr-4 text-white/50">
                        {order.line_items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </td>
                      <td className="py-3 pr-4 font-bold text-[#c0392b]">€{order.total}</td>
                      <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
                      <td className="py-3">
                        {canDownload && <InvoiceButton orderId={order.id} orderNumber={order.number} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
