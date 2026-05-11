"use client";

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import CinematicLoader from "@/components/CinematicLoader";
import { useLanguage } from "@/lib/LanguageContext";
import { createT } from "@/lib/translations";

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

  // Edit profile
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editPhone, setEditPhone] = useState("");

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
      setEditFirst(data.firstName || "");
      setEditLast(data.lastName || "");
      setEditStreet(data.billing?.address_1 || "");
      setEditCity(data.billing?.city || "");
      setEditZip(data.billing?.postcode || "");
      setEditCountry(data.billing?.country || "");
      setEditPhone(data.billing?.phone || "");
      setLoading(false);
    }
    load();
  }, [router]);

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setSaveMsg("");

      const res = await fetch("/api/auth/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editFirst,
          last_name: editLast,
          billing: {
            first_name: editFirst,
            last_name: editLast,
            address_1: editStreet,
            city: editCity,
            postcode: editZip,
            country: editCountry,
            phone: editPhone,
          },
          shipping: {
            first_name: editFirst,
            last_name: editLast,
            address_1: editStreet,
            city: editCity,
            postcode: editZip,
            country: editCountry,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCustomer((prev) =>
          prev
            ? {
                ...prev,
                firstName: data.firstName,
                lastName: data.lastName,
                billing: data.billing,
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
    [editFirst, editLast, editStreet, editCity, editZip, editCountry, editPhone]
  );

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
                            €{order.total}
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
                                  const itemTotal = parseFloat(item.total || "0");
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
                                        €{unitPrice.toFixed(2)} → €{itemTotal.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="flex items-center justify-between border-t border-[#222] pt-2">
                                  <span className="text-sm font-bold text-white/60">
                                    {t("GESAMT")}
                                  </span>
                                  <span className="text-lg font-black text-white">
                                    €{order.total}
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
        {saveMsg && (
          <p className="mt-3 text-xs text-green-400">{saveMsg}</p>
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
            <div>
              <FieldLabel>STRASSE</FieldLabel>
              <Input value={editStreet} onChange={setEditStreet} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel>PLZ</FieldLabel>
                <Input value={editZip} onChange={setEditZip} />
              </div>
              <div>
                <FieldLabel>ORT</FieldLabel>
                <Input value={editCity} onChange={setEditCity} />
              </div>
              <div>
                <FieldLabel>LAND</FieldLabel>
                <Input
                  value={editCountry}
                  onChange={setEditCountry}
                  placeholder="AT"
                />
              </div>
            </div>
            <div>
              <FieldLabel>TELEFON</FieldLabel>
              <Input value={editPhone} onChange={setEditPhone} />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer bg-[#c0392b] px-6 py-3 text-xs font-bold tracking-wider text-white transition-colors hover:bg-[#e74c3c] disabled:opacity-60"
              >
                {saving ? "..." : t("SPEICHERN")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer border border-[#333] bg-transparent px-6 py-3 text-xs font-bold tracking-wider text-white/50 transition-colors hover:text-white"
              >
                {t("ABBRECHEN")}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <div className="space-y-2 text-sm text-white/60">
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">
                  NAME:{" "}
                </span>
                <span className="text-white/80">
                  {customer.firstName} {customer.lastName}
                </span>
              </p>
              <p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">
                  E-MAIL:{" "}
                </span>
                <span className="text-white/80">{customer.email}</span>
              </p>
              {customer.billing?.address_1 && (
                <p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">
                    ADRESSE:{" "}
                  </span>
                  <span className="text-white/80">
                    {customer.billing.address_1},{" "}
                    {customer.billing.postcode} {customer.billing.city},{" "}
                    {customer.billing.country}
                  </span>
                </p>
              )}
              {customer.billing?.phone && (
                <p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">
                    TELEFON:{" "}
                  </span>
                  <span className="text-white/80">
                    {customer.billing.phone}
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 cursor-pointer border border-[#c0392b] bg-transparent px-6 py-2.5 text-xs font-bold tracking-wider text-[#c0392b] transition-colors hover:bg-[#c0392b] hover:text-white"
            >
              {t("BEARBEITEN")}
            </button>
          </div>
        )}
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
