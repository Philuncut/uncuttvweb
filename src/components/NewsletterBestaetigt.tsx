"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";

/** Inhalt der Bestätigungsseite /newsletter/bestaetigt, DE und EN. */
export default function NewsletterBestaetigt() {
  const { language } = useLanguage();
  const en = language === "en";

  return (
    <div>
      <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
        {en ? "SUBSCRIPTION CONFIRMED" : "ANMELDUNG BESTÄTIGT"}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-white/70">
        {en
          ? "Thanks, you are in. Your 10% discount code is on its way to your inbox, and from now on you will get news from UncutTV by email."
          : "Danke, du bist dabei. Dein Rabattcode über 10% ist unterwegs in dein Postfach, und ab jetzt bekommst du Neuigkeiten von UncutTV per E-Mail."}
      </p>
      <p className="mt-2 text-xs text-white/40">
        {en
          ? "You can unsubscribe at any time via the link at the end of every email."
          : "Abmelden kannst du dich jederzeit über den Link am Ende jeder Mail."}
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-block bg-[#c0392b] px-6 py-3 text-sm font-bold tracking-[0.2em] text-white transition-colors hover:bg-[#e74c3c]"
      >
        {en ? "BROWSE THE SHOP" : "ZUM SHOP"}
      </Link>
    </div>
  );
}
