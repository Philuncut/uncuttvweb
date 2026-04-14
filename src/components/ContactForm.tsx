"use client";

import { useState, useCallback, type FormEvent } from "react";

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
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
    />
  );
}

const SUBJECTS = [
  "Bestellung",
  "Händleranfrage",
  "Allgemeine Anfrage",
  "Presse",
  "Sonstiges",
];

export default function ContactForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            subject,
            message,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccess(true);
        } else {
          setError(data.error || "Senden fehlgeschlagen.");
        }
      } catch {
        setError("Verbindungsfehler.");
      } finally {
        setLoading(false);
      }
    },
    [firstName, lastName, email, subject, message]
  );

  if (success) {
    return (
      <div className="border border-green-800/50 bg-green-900/20 p-6 text-center">
        <p className="text-sm text-green-400">
          Deine Nachricht wurde gesendet. Wir melden uns so bald wie möglich.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>VORNAME</Label>
          <Input
            value={firstName}
            onChange={setFirstName}
            placeholder="Max"
            required
          />
        </div>
        <div>
          <Label>NACHNAME</Label>
          <Input
            value={lastName}
            onChange={setLastName}
            placeholder="Mustermann"
            required
          />
        </div>
      </div>

      <div>
        <Label>E-MAIL</Label>
        <Input
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="deine@email.com"
          required
        />
      </div>

      <div>
        <Label>BETREFF</Label>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-[#333] bg-[#111] px-3 py-3 text-sm text-white outline-none focus:border-[#c0392b]"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>NACHRICHT</Label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          required
          placeholder="Deine Nachricht..."
          className="w-full resize-y border border-[#333] bg-[#111] px-3 py-3 text-sm text-white placeholder:text-[#555] outline-none focus:border-[#c0392b]"
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
          "NACHRICHT SENDEN"
        )}
      </button>
    </form>
  );
}
