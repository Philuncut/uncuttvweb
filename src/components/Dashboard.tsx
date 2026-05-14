"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CinematicLoader from "@/components/CinematicLoader";
import AccountProfileForm from "@/components/AccountProfileForm";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import { parsePrice } from "@/lib/parse-price";

interface OrderLineItem {
  name: string;
  quantity: number;
  total: string;
  price: number;
}

interface Order {
  id: number;
  number: string;
  date_created: string;
  status: string;
  total: string;
  line_items: OrderLineItem[];
}

interface CustomerData {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  billing: {
    address_1?: string;
    city?: string;
    postcode?: string;
    country?: string;
    phone?: string;
  };
  orders: Order[];
}

const ORDERS_PER_PAGE = 3;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    processing: {
      label: "VERARBEITUNG",
      cls: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
    },
    completed: {
      label: "ABGESCHLOSSEN",
      cls: "bg-green-900/40 text-green-400 border border-green-800/50",
    },
    pending: {
      label: "AUSSTEHEND",
      cls: "bg-white/5 text-white/40 border border-white/10",
    },
    "on-hold": {
      label: "WARTEND",
      cls: "bg-white/5 text-white/40 border border-white/10",
    },
    cancelled: {
      label: "STORNIERT",
      cls: "bg-red-900/30 text-red-400 border border-red-800/50",
    },
    refunded: {
      label: "ERSTATTET",
      cls: "bg-white/5 text-white/40 border border-white/10",
    },
    failed: {
      label: "FEHLGESCHLAGEN",
      cls: "bg-red-900/30 text-red-400 border border-red-800/50",
    },
  };
  const s = map[status] || {
    label: status.toUpperCase(),
    cls: "bg-white/5 text-white/40 border border-white/10",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[9px] font-bold tracking-wider ${s.cls}`}
    >
      {s.label}
    </span>
  );
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

export default function Dashboard() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);

  // Orders pagination + detail
  const [ordersShown, setOrdersShown] = useState(ORDERS_PER_PAGE);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState<number | null>(null);
  const { language } = useLanguage();
  const t = createT(language);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/konto/login");
        return;
      }
      const data = await res.json();
      setCustomer(data);
      setLoading(false);
    }
    load();
  }, [router]);

  const handlePasswordChange = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setPwError("");
      setPwMsg("");

      if (newPw !== confirmPw) {
        setPwError("Passwörter stimmen nicht überein.");
        return;
      }
      if (newPw.length < 8) {
        setPwError("Mindestens 8 Zeichen erforderlich.");
        return;
      }

      setPwLoading(true);
      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: currentPw,
            newPassword: newPw,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setPwMsg("Passwort erfolgreich geändert.");
          setCurrentPw("");
          setNewPw("");
          setConfirmPw("");
          setTimeout(() => setPwMsg(""), 5000);
        } else {
          setPwError(data.error || "Fehler beim Ändern.");
        }
      } catch {
        setPwError("Verbindungsfehler.");
      } finally {
        setPwLoading(false);
      }
    },
    [currentPw, newPw, confirmPw]
  );

  const downloadInvoice = useCallback(async (orderId: number, orderNumber: string) => {
    setInvoiceLoading(orderId);
    try {
      const res = await fetch(`/api/orders/invoice?order_id=${orderId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rechnung-RE-${orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent fail
    } finally {
      setInvoiceLoading(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("uncuttv:session-changed"));
    router.push("/");
  }, [router]);

  if (loading) return <CinematicLoader show />;

  if (!customer) return null;

  const totalOrders = customer.orders.length;
  const visibleOrders = customer.orders.slice(0, ordersShown);
  const hasMore = ordersShown < totalOrders;

  return (
    <div className="space-y-12">
      {/* Greeting */}
      <h1 className="text-2xl font-black tracking-[0.15em] text-white sm:text-3xl">
        {t("WILLKOMMEN")}, {customer.firstName.toUpperCase()}
      </h1>

      {/* Section 1 — Orders */}
      <section>
        <SectionTitle>{t("MEINE_BESTELLUNGEN")}</SectionTitle>
        {totalOrders === 0 ? (
          <p className="mt-4 text-sm text-white/30">
            {t("NOCH_KEINE_BESTELLUNGEN")}
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#222] text-[10px] font-bold uppercase tracking-wider text-white/40">
                    <th className="pb-3 pr-4">NR.</th>
                    <th className="pb-3 pr-4">DATUM</th>
                    <th className="pb-3 pr-4">PRODUKTE</th>
                    <th className="pb-3 pr-4">BETRAG</th>
                    <th className="pb-3">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const isExpanded = expandedOrder === order.id;
                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          className="cursor-pointer border-b border-[#1a1a1a] transition-colors hover:bg-[#111]"
                          onClick={() =>
                            setExpandedOrder(isExpanded ? null : order.id)
                          }
                        >
                          <td className="py-3 pr-4 font-bold text-white/70">
                            #{order.number}
                          </td>
                          <td className="py-3 pr-4 text-white/50">
                            {new Date(order.date_created).toLocaleDateString(
                              "de-AT"
                            )}
                          </td>
                          <td className="py-3 pr-4 text-white/50">
                            {order.line_items
                              .map((i) => `${i.quantity}× ${i.name}`)
                              .join(", ")}
                          </td>
                          <td className="py-3 pr-4 font-bold text-[#c0392b]">
                            {formatPrice(parsePrice(order.total))}
                          </td>
                          <td className="py-3">
                            <StatusBadge status={order.status} />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="border-b border-[#1a1a1a] bg-[#111] p-4">
                              <div className="space-y-2">
                                {order.line_items.map((item, i) => {
                                  const itemTotal = parsePrice(item.total || "0");
                                  const unitPrice = item.quantity > 0 ? itemTotal / item.quantity : 0;
                                  return (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <span className="text-white/70">
                                        {item.quantity}× {item.name}
                                      </span>
                                      <span className="text-white/50">
                                        {formatPrice(unitPrice)} → {formatPrice(itemTotal)}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="flex items-center justify-between border-t border-[#222] pt-2">
                                  <span className="text-sm font-bold text-white/60">
                                    {t("GESAMT")}
                                  </span>
                                  <span className="text-lg font-black text-white">
                                    {formatPrice(parsePrice(order.total))}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadInvoice(order.id, order.number);
                                }}
                                disabled={invoiceLoading === order.id}
                                className="mt-4 cursor-pointer border border-[#c0392b] bg-transparent px-5 py-2 text-xs font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-50"
                              >
                                {invoiceLoading === order.id
                                  ? "..."
                                  : "RECHNUNG ALS PDF HERUNTERLADEN"}
                              </button>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Order count + show more */}
            <div className="mt-4 flex flex-col items-center gap-3">
              <p className="text-[11px] text-white/30">
                {Math.min(ordersShown, totalOrders)} von {totalOrders}{" "}
                Bestellungen
              </p>
              {hasMore && (
                <button
                  type="button"
                  onClick={() =>
                    setOrdersShown((v) => v + ORDERS_PER_PAGE)
                  }
                  className="cursor-pointer border border-[#c0392b] bg-transparent px-8 py-3 text-xs font-bold tracking-wider text-[#c0392b] transition-colors duration-200 hover:bg-[#c0392b] hover:text-white"
                >
                  {t("MEHR_ANZEIGEN")}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* Section 2 — My Data */}
      <section>
        <SectionTitle>{t("MEINE_DATEN")}</SectionTitle>
        <AccountProfileForm />
      </section>

      {/* Section 3 — Change Password */}
      <section>
        <SectionTitle>{t("PASSWORT_AENDERN")}</SectionTitle>
        {pwMsg && (
          <p className="mt-3 text-xs text-green-400">{pwMsg}</p>
        )}
        {pwError && (
          <p className="mt-3 text-xs text-[#c0392b]">{pwError}</p>
        )}
        <form onSubmit={handlePasswordChange} className="mt-4 space-y-3 max-w-sm">
          <div>
            <FieldLabel>AKTUELLES PASSWORT</FieldLabel>
            <Input
              type="password"
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="••••••••"
            />
          </div>
          <div>
            <FieldLabel>NEUES PASSWORT</FieldLabel>
            <Input
              type="password"
              value={newPw}
              onChange={setNewPw}
              placeholder="Min. 8 Zeichen"
            />
          </div>
          <div>
            <FieldLabel>NEUES PASSWORT WIEDERHOLEN</FieldLabel>
            <Input
              type="password"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={pwLoading}
            className="cursor-pointer border border-[#c0392b] bg-transparent px-6 py-3 text-xs font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white disabled:opacity-60"
          >
            {pwLoading ? "..." : t("PASSWORT_AENDERN")}
          </button>
        </form>
      </section>

      {/* Section 4 — Logout */}
      <section className="border-t border-[#222] pt-8">
        <button
          type="button"
          onClick={handleLogout}
          className="cursor-pointer border border-[#333] bg-transparent px-8 py-3 text-xs font-bold tracking-wider text-white/50 transition-colors hover:border-[#c0392b] hover:text-white"
        >
          {t("ABMELDEN")}
        </button>
      </section>
    </div>
  );
}
