"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCOUNT_COUNTRIES } from "@/lib/countries";

type SessionType = "haendler" | "customer" | null;

type ProfileResponse = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  billing: {
    company: string;
    vat: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    country: string;
    state: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    postcode: string;
    country: string;
    state: string;
  };
  shipping_same_as_billing: boolean;
};

const emptyProfile: ProfileResponse = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  billing: {
    company: "",
    vat: "",
    phone: "",
    address_1: "",
    address_2: "",
    city: "",
    postcode: "",
    country: "AT",
    state: "",
  },
  shipping: {
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    postcode: "",
    country: "AT",
    state: "",
  },
  shipping_same_as_billing: true,
};

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
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
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

function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value || "AT"}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-[#333] bg-[#111] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c0392b]"
    >
      {ACCOUNT_COUNTRIES.map((country) => (
        <option key={country.code} value={country.code}>
          {country.label}
        </option>
      ))}
    </select>
  );
}

export default function AccountProfileForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>(null);
  const [profile, setProfile] = useState<ProfileResponse>(emptyProfile);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const [sessionRes, profileRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/auth/profile"),
        ]);

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          setSessionType(sessionData.type ?? null);
        }

        if (!profileRes.ok) {
          const error = await profileRes.json().catch(() => ({ error: "Profil konnte nicht geladen werden." }));
          setErrorMsg(error.error || "Profil konnte nicht geladen werden.");
          setLoading(false);
          return;
        }

        const profileData = (await profileRes.json()) as ProfileResponse;
        setProfile({
          ...profileData,
          billing: {
            ...profileData.billing,
            country: profileData.billing.country || "AT",
          },
          shipping: {
            ...profileData.shipping,
            country: profileData.shipping.country || "AT",
          },
        });
      } catch {
        setErrorMsg("Profil konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const showCompanySection = useMemo(() => {
    return (
      sessionType === "haendler" ||
      Boolean(profile.billing.company) ||
      Boolean(profile.billing.vat)
    );
  }, [profile.billing.company, profile.billing.vat, sessionType]);

  const updateProfile = useCallback(
    (updater: (prev: ProfileResponse) => ProfileResponse) => {
      setProfile((prev) => updater(prev));
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setErrorMsg("");
      setSuccessMsg("");
      if (
        sessionType === "haendler" &&
        (!profile.billing.company.trim() || !profile.billing.vat.trim())
      ) {
        setErrorMsg("Firmenname und UID-Nummer sind für Händler erforderlich.");
        setSaving(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Speichern fehlgeschlagen.");
          setSaving(false);
          return;
        }
        setProfile(data.profile);
        setSuccessMsg("Daten gespeichert");
        setTimeout(() => setSuccessMsg(""), 3000);
      } catch {
        setErrorMsg("Speichern fehlgeschlagen.");
      } finally {
        setSaving(false);
      }
    },
    [profile, sessionType]
  );

  if (loading) {
    return (
      <div className="mt-4 space-y-3 animate-pulse" aria-hidden>
        <div className="h-10 w-full rounded bg-white/5" />
        <div className="h-10 w-full rounded bg-white/5" />
        <div className="h-10 w-full rounded bg-white/5" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-6">
      {successMsg && <p className="text-xs text-green-400">{successMsg}</p>}
      {errorMsg && <p className="text-xs text-[#c0392b]">{errorMsg}</p>}

      <section className="space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
          KONTAKT
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>VORNAME</FieldLabel>
            <Input
              value={profile.first_name}
              onChange={(value) =>
                updateProfile((prev) => ({ ...prev, first_name: value }))
              }
            />
          </div>
          <div>
            <FieldLabel>NACHNAME</FieldLabel>
            <Input
              value={profile.last_name}
              onChange={(value) =>
                updateProfile((prev) => ({ ...prev, last_name: value }))
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>E-MAIL</FieldLabel>
            <Input
              type="email"
              value={profile.email}
              onChange={(value) =>
                updateProfile((prev) => ({ ...prev, email: value }))
              }
            />
          </div>
          <div>
            <FieldLabel>TELEFON</FieldLabel>
            <Input
              value={profile.billing.phone}
              onChange={(value) =>
                updateProfile((prev) => ({
                  ...prev,
                  phone: value,
                  billing: { ...prev.billing, phone: value },
                }))
              }
            />
          </div>
        </div>
      </section>

      {showCompanySection && (
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
            FIRMA & UID
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>FIRMENNAME</FieldLabel>
              <Input
                value={profile.billing.company}
                onChange={(value) =>
                  updateProfile((prev) => ({
                    ...prev,
                    billing: { ...prev.billing, company: value },
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel>UID-NUMMER</FieldLabel>
              <Input
                value={profile.billing.vat}
                onChange={(value) =>
                  updateProfile((prev) => ({
                    ...prev,
                    billing: { ...prev.billing, vat: value.toUpperCase() },
                  }))
                }
                placeholder="ATU12345678"
              />
              <p className="mt-1 text-[11px] text-white/40">
                Pflichtfeld für Händler — wird auf Rechnungen ausgewiesen
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
          RECHNUNGSADRESSE
        </h3>
        <div>
          <FieldLabel>STRASSE + HAUSNUMMER</FieldLabel>
          <Input
            value={profile.billing.address_1}
            onChange={(value) =>
              updateProfile((prev) => ({
                ...prev,
                billing: { ...prev.billing, address_1: value },
              }))
            }
          />
        </div>
        <div>
          <FieldLabel>ADRESSZUSATZ</FieldLabel>
          <Input
            value={profile.billing.address_2}
            onChange={(value) =>
              updateProfile((prev) => ({
                ...prev,
                billing: { ...prev.billing, address_2: value },
              }))
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>PLZ</FieldLabel>
            <Input
              value={profile.billing.postcode}
              onChange={(value) =>
                updateProfile((prev) => ({
                  ...prev,
                  billing: { ...prev.billing, postcode: value },
                }))
              }
            />
          </div>
          <div>
            <FieldLabel>STADT</FieldLabel>
            <Input
              value={profile.billing.city}
              onChange={(value) =>
                updateProfile((prev) => ({
                  ...prev,
                  billing: { ...prev.billing, city: value },
                }))
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>LAND</FieldLabel>
            <CountrySelect
              value={profile.billing.country}
              onChange={(value) =>
                updateProfile((prev) => ({
                  ...prev,
                  billing: { ...prev.billing, country: value },
                }))
              }
            />
          </div>
          <div>
            <FieldLabel>BUNDESLAND/REGION</FieldLabel>
            <Input
              value={profile.billing.state}
              onChange={(value) =>
                updateProfile((prev) => ({
                  ...prev,
                  billing: { ...prev.billing, state: value },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
          LIEFERADRESSE
        </h3>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={!profile.shipping_same_as_billing}
            onChange={(e) =>
              updateProfile((prev) => ({
                ...prev,
                shipping_same_as_billing: !e.target.checked,
              }))
            }
            className="h-4 w-4 cursor-pointer accent-[#c0392b]"
          />
          <span className="text-xs text-white/50">
            Lieferadresse weicht von Rechnungsadresse ab
          </span>
        </label>

        {!profile.shipping_same_as_billing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>VORNAME</FieldLabel>
                <Input
                  value={profile.shipping.first_name}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, first_name: value },
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel>NACHNAME</FieldLabel>
                <Input
                  value={profile.shipping.last_name}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, last_name: value },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <FieldLabel>FIRMENNAME</FieldLabel>
              <Input
                value={profile.shipping.company}
                onChange={(value) =>
                  updateProfile((prev) => ({
                    ...prev,
                    shipping: { ...prev.shipping, company: value },
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel>STRASSE + HAUSNUMMER</FieldLabel>
              <Input
                value={profile.shipping.address_1}
                onChange={(value) =>
                  updateProfile((prev) => ({
                    ...prev,
                    shipping: { ...prev.shipping, address_1: value },
                  }))
                }
              />
            </div>
            <div>
              <FieldLabel>ADRESSZUSATZ</FieldLabel>
              <Input
                value={profile.shipping.address_2}
                onChange={(value) =>
                  updateProfile((prev) => ({
                    ...prev,
                    shipping: { ...prev.shipping, address_2: value },
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>PLZ</FieldLabel>
                <Input
                  value={profile.shipping.postcode}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, postcode: value },
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel>STADT</FieldLabel>
                <Input
                  value={profile.shipping.city}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, city: value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>LAND</FieldLabel>
                <CountrySelect
                  value={profile.shipping.country}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, country: value },
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel>BUNDESLAND/REGION</FieldLabel>
                <Input
                  value={profile.shipping.state}
                  onChange={(value) =>
                    updateProfile((prev) => ({
                      ...prev,
                      shipping: { ...prev.shipping, state: value },
                    }))
                  }
                />
              </div>
            </div>
          </>
        )}
      </section>

      <button
        type="submit"
        disabled={saving}
        className="cursor-pointer bg-[#c0392b] px-6 py-3 text-xs font-bold tracking-wider text-white transition-colors hover:bg-[#e74c3c] disabled:opacity-60"
      >
        {saving ? "..." : "SPEICHERN"}
      </button>
    </form>
  );
}
