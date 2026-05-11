"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { HaendlerAnfrageBody } from "@/types/haendlerAnfrage";

type AnfrageStatus = "idle" | "success" | "error";

const initialForm: HaendlerAnfrageBody = {
  firmenname: "",
  vorname: "",
  nachname: "",
  email: "",
  telefon: "",
  land: "",
  adresse: "",
  uid: "",
  website: "",
  verkaufskanal: "",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  required = true,
  pattern,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  title?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      pattern={pattern}
      title={title}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

export default function HaendlerAnfragePage() {
  const [form, setForm] = useState<HaendlerAnfrageBody>(initialForm);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AnfrageStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setErrorMsg("");

      try {
        const res = await fetch("/api/haendler/anfrage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };

        if (data.success) {
          setStatus("success");
          return;
        }

        setStatus("error");
        setErrorMsg(data.error || "Anfrage konnte nicht gesendet werden.");
      } catch {
        setStatus("error");
        setErrorMsg("Verbindungsfehler. Bitte erneut versuchen.");
      } finally {
        setLoading(false);
      }
    },
    [form]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href="/haendler"
          className="text-xs font-bold uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-[#c0392b]"
        >
          ← Zurück zum Login
        </Link>

        <h1 className="mt-6 text-center text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          HÄNDLER-ANFRAGE
        </h1>
        <p className="mt-3 text-center text-sm text-white/40">
          Wir prüfen jede Anfrage persönlich und melden uns innerhalb von 48
          Stunden.
        </p>

        <div className="mt-8 border border-[#222] bg-[#0d0d0d] p-5 sm:p-8">
          {status === "success" ? (
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
                ANFRAGE ERHALTEN
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[0.05em] text-white">
                Danke für dein Interesse.
              </h2>
              <p className="mt-4 text-sm text-white/40">
                Wir prüfen deine Anfrage und melden uns innerhalb von 48 Stunden
                bei dir.
              </p>
              <Link
                href="/haendler"
                className="mt-6 inline-block text-xs font-bold uppercase tracking-[0.12em] text-[#c0392b] hover:text-[#e74c3c]"
              >
                Zurück zum Händlerportal
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Firmenname</Label>
                <Input
                  value={form.firmenname}
                  onChange={(v) => setForm((f) => ({ ...f, firmenname: v }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Ansprechpartner Vorname</Label>
                  <Input
                    value={form.vorname}
                    onChange={(v) => setForm((f) => ({ ...f, vorname: v }))}
                  />
                </div>
                <div>
                  <Label>Ansprechpartner Nachname</Label>
                  <Input
                    value={form.nachname}
                    onChange={(v) => setForm((f) => ({ ...f, nachname: v }))}
                  />
                </div>
              </div>

              <div>
                <Label>E-Mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Telefon</Label>
                  <Input
                    type="tel"
                    value={form.telefon}
                    onChange={(v) => setForm((f) => ({ ...f, telefon: v }))}
                  />
                </div>
                <div>
                  <Label>Land</Label>
                  <Input
                    value={form.land}
                    onChange={(v) => setForm((f) => ({ ...f, land: v }))}
                  />
                </div>
              </div>

              <div>
                <Label>Adresse</Label>
                <Input
                  value={form.adresse}
                  onChange={(v) => setForm((f) => ({ ...f, adresse: v }))}
                />
              </div>

              <div>
                <Label>UID-Nummer</Label>
                <Input
                  value={form.uid}
                  onChange={(v) => setForm((f) => ({ ...f, uid: v }))}
                  placeholder="ATU12345678 oder DE123456789"
                />
              </div>

              <div>
                <Label>Website / Online-Shop</Label>
                <Input
                  type="text"
                  value={form.website}
                  onChange={(v) => setForm((f) => ({ ...f, website: v }))}
                  pattern="^(https?:\\/\\/)?(www\\.)?[a-zA-Z0-9][a-zA-Z0-9-]*\\.[a-zA-Z]{2,}([\\/\\?#].*)?$"
                  title="Bitte gib eine gültige Domain ein (z.B. example.de oder www.example.com)"
                  placeholder="www.example.com oder example.de"
                />
              </div>

              <div>
                <Label>Verkaufskanal</Label>
                <select
                  required
                  value={form.verkaufskanal}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      verkaufskanal: e.target.value as HaendlerAnfrageBody["verkaufskanal"],
                    }))
                  }
                  className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white outline-none focus:border-[#c0392b]"
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  <option value="Eigenes Ladengeschaeft">
                    Eigenes Ladengeschäft
                  </option>
                  <option value="Online-Shop">Online-Shop</option>
                  <option value="Beides (Laden + Online)">
                    Beides (Laden + Online)
                  </option>
                  <option value="Messen / Maerkte">Messen / Märkte</option>
                  <option value="Sonstiges">Sonstiges</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "WIRD GESENDET..." : "ANFRAGE SENDEN"}
              </button>

              {status === "error" && (
                <div className="pt-1">
                  <p className="text-sm text-[#c0392b]">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("idle");
                      setErrorMsg("");
                    }}
                    className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-white/50 underline hover:text-white/80"
                  >
                    Erneut versuchen
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
