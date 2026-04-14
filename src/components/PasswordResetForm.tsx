"use client";

import { useState, useCallback, type FormEvent } from "react";

export default function PasswordResetForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          setSubmitted(true);
        } else {
          const data = await res.json();
          setError(data.error || "Anfrage fehlgeschlagen.");
        }
      } catch {
        setError("Verbindungsfehler.");
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  if (submitted) {
    return (
      <div className="border border-[#222] bg-[#111] p-6">
        <p className="text-sm leading-relaxed text-white/70">
          Falls ein Konto mit dieser E-Mail existiert, wurde eine Reset-E-Mail
          gesendet. Bitte prüfe auch deinen Spam-Ordner.
        </p>
        <a
          href="/konto/login"
          className="mt-4 inline-block text-sm text-[#c0392b] hover:underline"
        >
          Zurück zum Login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">
          E-MAIL
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.com"
          className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
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
          "LINK SENDEN"
        )}
      </button>
      <a
        href="/konto/login"
        className="block text-center text-xs text-white/40 transition-colors hover:text-[#c0392b]"
      >
        Zurück zum Login
      </a>
    </form>
  );
}
