"use client";

import { useCallback, useState, type FormEvent } from "react";
import { PasswordToggleInput } from "@/components/PasswordToggleInput";

/**
 * Der Zwischenschritt, wenn Shop und Konto verschiedene Passwörter haben.
 *
 * Der Identitätsdienst hat das eingegebene Passwort gegen Supabase
 * bestätigt, WordPress kennt aber noch ein anderes. Ohne WordPress-Token
 * gibt es keine Shop-Sitzung, also muss der Nutzer einmalig neu setzen;
 * der Dienst schreibt das neue Passwort dann an beide Stellen.
 *
 * Das aktuelle Passwort kommt aus dem Zustand des Anmeldeformulars. Der
 * Nutzer hat es Sekunden vorher eingegeben, es wurde bestätigt, und es
 * geht von hier aus an keine andere Stelle als die Wechselroute.
 *
 * Nach dem Wechsel meldet die aufrufende Seite den Nutzer von sich aus mit
 * dem neuen Passwort an — über dieselbe Route wie sonst, damit Rollen und
 * Cookies durch genau den Code laufen, der auch sonst gilt.
 */
export function PasswordResyncForm({
  email,
  currentPassword,
  onDone,
  onCancel,
}: {
  email: string;
  currentPassword: string;
  /** Wird mit dem neuen Passwort gerufen, sobald der Dienst es gesetzt hat. */
  onDone: (newPassword: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");

      if (newPw !== confirmPw) {
        setError("Passwörter stimmen nicht überein.");
        return;
      }
      if (newPw.length < 8) {
        setError("Mindestens 8 Zeichen erforderlich.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, currentPassword, newPassword: newPw }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Passwort konnte nicht gesetzt werden.");
          setLoading(false);
          return;
        }
        await onDone(newPw);
      } catch {
        setError("Verbindungsfehler.");
        setLoading(false);
      }
    },
    [newPw, confirmPw, email, currentPassword, onDone]
  );

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="border border-[#333] bg-[#111] px-4 py-3 text-xs leading-relaxed text-white/60">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c0392b]">
          Passwort einmalig neu setzen
        </p>
        <p>
          Dein Shop-Konto und dein UncutTV-Konto haben verschiedene Passwörter.
          Setz jetzt ein neues, es gilt danach überall. Du bist anschließend
          angemeldet.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
          Neues Passwort
        </label>
        <PasswordToggleInput
          value={newPw}
          onChange={setNewPw}
          visible={showNew}
          onToggle={() => setShowNew((v) => !v)}
          autoComplete="new-password"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
          Neues Passwort wiederholen
        </label>
        <PasswordToggleInput
          value={confirmPw}
          onChange={setConfirmPw}
          visible={showConfirm}
          onToggle={() => setShowConfirm((v) => !v)}
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
          "PASSWORT SETZEN UND ANMELDEN"
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="mt-3 block w-full cursor-pointer bg-transparent text-center text-xs text-white/40 transition-colors hover:text-[#c0392b]"
      >
        Zurück zur Anmeldung
      </button>
    </form>
  );
}
