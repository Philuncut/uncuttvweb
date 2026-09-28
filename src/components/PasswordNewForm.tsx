"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PasswordToggleInput } from "@/components/PasswordToggleInput";

/**
 * Neues Passwort nach dem Reset-Link (Seite /passwort-vergessen/neu).
 *
 * Die Wiederherstellungssitzung steht im Fragment der Adresse, so wie
 * Supabase sie anhängt: #access_token=…&refresh_token=…&type=recovery. Das
 * Fragment liest nur der Browser. Es wird sofort aus der Adresse entfernt,
 * damit es nicht in Verlauf, Lesezeichen oder einem geteilten Link
 * weiterlebt; das Token bleibt bis zum Absenden im Zustand.
 *
 * Kein Supabase-Client im Shop: Das Token geht an /api/auth/reset-password,
 * und der Identitätsdienst setzt das Passwort an beiden Stellen. Er
 * verlangt eine frische Sitzung (höchstens 15 Minuten); ist sie abgelaufen
 * oder fehlt sie, gibt es hier statt des Formulars den Weg zu einem neuen
 * Link.
 *
 * Bei einem Fehler im Fragment (#error=…&error_code=otp_expired) steht kein
 * Token da: dieselbe Behandlung wie ein fehlender Link.
 */

type Zustand =
  | { art: "lade" }
  | { art: "bereit"; accessToken: string }
  | { art: "abgelaufen" }
  | { art: "fertig"; signedIn: boolean };

function tokenAusFragment(): string | null {
  const roh = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!roh) return null;
  const params = new URLSearchParams(roh);
  if (params.get("error") || params.get("error_code")) return null;
  const token = params.get("access_token");
  const type = params.get("type");
  if (!token || type !== "recovery") return null;
  return token;
}

function fragmentEntfernen(): void {
  try {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search
    );
  } catch {
    // Ohne History-API bleibt das Fragment stehen; das ist nur unschoen.
  }
}

export default function PasswordNewForm() {
  const [zustand, setZustand] = useState<Zustand>({ art: "lade" });
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = tokenAusFragment();
    fragmentEntfernen();
    setZustand(token ? { art: "bereit", accessToken: token } : { art: "abgelaufen" });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (zustand.art !== "bereit") return;
      setError("");

      if (newPw.length < 8) {
        setError("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
        return;
      }
      if (newPw !== confirmPw) {
        setError("Die Passwörter stimmen nicht überein.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: zustand.accessToken,
            newPassword: newPw,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          signedIn?: boolean;
        };

        if (res.ok) {
          setZustand({ art: "fertig", signedIn: Boolean(data.signedIn) });
          return;
        }
        if (data.code === "recovery_expired") {
          setZustand({ art: "abgelaufen" });
          return;
        }
        setError(data.error || "Das Passwort konnte nicht gesetzt werden.");
      } catch {
        setError("Verbindungsfehler.");
      } finally {
        setLoading(false);
      }
    },
    [zustand, newPw, confirmPw]
  );

  if (zustand.art === "lade") {
    return <p className="text-sm text-white/50">Einen Moment …</p>;
  }

  if (zustand.art === "abgelaufen") {
    return (
      <div className="border border-[#222] bg-[#111] p-6">
        <p className="text-sm leading-relaxed text-white/70">
          Dieser Link ist abgelaufen oder wurde schon benutzt. Ein Link gilt
          15 Minuten und nur einmal. Bitte fordere einen neuen an.
        </p>
        <a
          href="/passwort-vergessen"
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          Neuen Link anfordern
        </a>
      </div>
    );
  }

  if (zustand.art === "fertig") {
    return (
      <div className="border border-[#222] bg-[#111] p-6">
        <p className="text-sm leading-relaxed text-white/70">
          Dein Passwort ist gesetzt. Es gilt ab jetzt im Shop, in der App und
          auf uncuttv.app.
        </p>
        <a
          href={zustand.signedIn ? "/konto/dashboard" : "/konto/login"}
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          {zustand.signedIn ? "Zum Konto" : "Zum Login"}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
          NEUES PASSWORT
        </label>
        <PasswordToggleInput
          value={newPw}
          onChange={setNewPw}
          visible={showNew}
          onToggle={() => setShowNew((s) => !s)}
          placeholder="Mindestens 8 Zeichen"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
          PASSWORT WIEDERHOLEN
        </label>
        <PasswordToggleInput
          value={confirmPw}
          onChange={setConfirmPw}
          visible={showConfirm}
          onToggle={() => setShowConfirm((s) => !s)}
          placeholder="Noch einmal eingeben"
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-[#c0392b]">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full cursor-pointer items-center justify-center bg-[#c0392b] py-4 text-sm font-bold tracking-[0.2em] text-white transition-all duration-300 hover:bg-[#e74c3c] hover:shadow-[0_0_20px_rgba(192,57,43,0.5)] disabled:opacity-60"
      >
        {loading ? (
          <div className="h-5 w-5 animate-spin border-2 border-white border-t-transparent" />
        ) : (
          "PASSWORT SPEICHERN"
        )}
      </button>
    </form>
  );
}
