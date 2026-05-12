"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ACCOUNT_COUNTRIES } from "@/lib/countries";

type SessionData = {
  type: "haendler" | "customer" | null;
  isWholesale: boolean;
};

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

/** Map API/profile JSON onto a controlled form state (`billing.vat` always defined). */
function normalizeProfileFromApi(raw: unknown): ProfileResponse {
  const profileData = raw as Partial<ProfileResponse> & {
    billing?: Partial<ProfileResponse["billing"]>;
    shipping?: Partial<ProfileResponse["shipping"]>;
  };

  const b: Partial<ProfileResponse["billing"]> = profileData.billing ?? {};

  const vatRaw = b.vat;
  const vat =
    typeof vatRaw === "string"
      ? vatRaw.trim().toUpperCase()
      : String(vatRaw ?? "").trim().toUpperCase();

  return {
    ...emptyProfile,
    ...profileData,
    billing: {
      ...emptyProfile.billing,
      ...b,
      company: String(b.company ?? "").trim(),
      vat,
      phone: String(b.phone ?? "").trim(),
      address_1: String(b.address_1 ?? "").trim(),
      address_2: String(b.address_2 ?? "").trim(),
      city: String(b.city ?? "").trim(),
      postcode: String(b.postcode ?? "").trim(),
      country: String(b.country ?? "").trim() || "AT",
      state: String(b.state ?? "").trim(),
    },
    shipping: {
      ...emptyProfile.shipping,
      ...(profileData.shipping ?? {}),
      first_name: String(profileData.shipping?.first_name ?? "").trim(),
      last_name: String(profileData.shipping?.last_name ?? "").trim(),
      company: String(profileData.shipping?.company ?? "").trim(),
      address_1: String(profileData.shipping?.address_1 ?? "").trim(),
      address_2: String(profileData.shipping?.address_2 ?? "").trim(),
      city: String(profileData.shipping?.city ?? "").trim(),
      postcode: String(profileData.shipping?.postcode ?? "").trim(),
      country:
        String(profileData.shipping?.country ?? "").trim() || "AT",
      state: String(profileData.shipping?.state ?? "").trim(),
    },
    first_name: String(profileData.first_name ?? "").trim(),
    last_name: String(profileData.last_name ?? "").trim(),
    email: String(profileData.email ?? "").trim(),
    phone: String(profileData.phone ?? "").trim(),
    shipping_same_as_billing:
      profileData.shipping_same_as_billing !== undefined
        ? Boolean(profileData.shipping_same_as_billing)
        : emptyProfile.shipping_same_as_billing,
  };
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
  const [session, setSession] = useState<SessionData>({
    type: null,
    isWholesale: false,
  });
  const [profile, setProfile] = useState<ProfileResponse>(emptyProfile);
  const profileRef = useRef<ProfileResponse>(emptyProfile);
  profileRef.current = profile;

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showBusinessFields, setShowBusinessFields] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const [sessionRes, profileRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/auth/profile"),
        ]);

        if (!cancelled && sessionRes.ok) {
          const sessionData = await sessionRes.json();
          setSession({
            type: sessionData.type ?? null,
            isWholesale: sessionData.isWholesale === true,
          });
        }

        if (!profileRes.ok) {
          const error = await profileRes.json().catch(() => ({
            error: "Profil konnte nicht geladen werden.",
          }));
          if (!cancelled) {
            setErrorMsg(error.error || "Profil konnte nicht geladen werden.");
          }
          return;
        }

        const raw = await profileRes.json();

        if (!cancelled) {
          setProfile(normalizeProfileFromApi(raw));
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Profil konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasStoredCompanyData = useMemo(
    () => Boolean(profile.billing.company) || Boolean(profile.billing.vat),
    [profile.billing.company, profile.billing.vat]
  );

  const showCompanySection = useMemo(() => {
    return (
      session.isWholesale ||
      hasStoredCompanyData ||
      showBusinessFields
    );
  }, [session.isWholesale, hasStoredCompanyData, showBusinessFields]);

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
      const snapshot = profileRef.current;
      if (
        session.isWholesale &&
        (!snapshot.billing.company.trim() || !snapshot.billing.vat.trim())
      ) {
        setErrorMsg("Firmenname und UID-Nummer sind für Händler erforderlich.");
        setSaving(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Speichern fehlgeschlagen.");
          setSaving(false);
          return;
        }
        if (data.profile) {
          setProfile(normalizeProfileFromApi(data.profile));
        }
        setSuccessMsg("Daten gespeichert");
        setTimeout(() => setSuccessMsg(""), 3000);
      } catch {
        setErrorMsg("Speichern fehlgeschlagen.");
      } finally {
        setSaving(false);
      }
    },
    [session.isWholesale]
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

      {!showCompanySection && !session.isWholesale && (
        <div className="rounded border border-[#333] bg-[#111] px-4 py-3">
          <button
            type="button"
            onClick={() => setShowBusinessFields(true)}
            className="cursor-pointer text-xs font-bold tracking-[0.08em] text-white/60 underline underline-offset-2 hover:text-white"
          >
            Geschäftskunde? Firmendaten eingeben
          </button>
        </div>
      )}

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
                onChange={(value) => {
                  const next = String(value).toUpperCase().trimEnd();
                  updateProfile((prev) => ({
                    ...prev,
                    billing: { ...prev.billing, vat: next },
                  }));
                }}
                placeholder="ATU12345678"
              />
              <p className="mt-1 text-[11px] text-white/40">
                Pflichtfeld für Händler — wird auf Rechnungen ausgewiesen
                {session.isWholesale ? " (erforderlich)" : ""}
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
