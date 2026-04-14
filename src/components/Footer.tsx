"use client";

import Link from "next/link";
import { openCookieSettings } from "@/components/CookieConsent";

export default function Footer() {
  return (
    <footer className="w-full border-t border-[#222] bg-[#0d0d0d] px-4 pt-10 pb-6 sm:px-6">
      <div className="mx-auto max-w-7xl">
        {/* Top — Logo + tagline */}
        <div className="text-center sm:text-left">
          <Link href="/" className="text-2xl font-black tracking-wider">
            <span className="text-white">UNCUT</span>
            <span className="text-[#c0392b]">TV</span>
          </Link>
          <p className="mt-2 text-xs tracking-wider text-white/40">
            Europas kompromissloseste Horror-Plattform.
          </p>
        </div>

        {/* Middle — 3 columns */}
        <div className="mt-8 grid gap-8 text-center sm:grid-cols-3 sm:text-left">
          {/* Column 1 — Unternehmen */}
          <div>
            <h3 className="text-xs font-bold tracking-[0.2em] text-white/60">
              UNTERNEHMEN
            </h3>
            <div className="mt-3 space-y-1 text-xs leading-relaxed text-white/40">
              <p>UncutTV GmbH</p>
              <p>Kalchgruben 4/11, 6094 Axams, Österreich</p>
              <p>
                <a
                  href="mailto:office@uncuttv.at"
                  className="transition-colors hover:text-white/70"
                >
                  office@uncuttv.at
                </a>
              </p>
              <p>FN 643542 k &middot; ATU 815 26 957</p>
              <p>Geschäftsführung: Florian Schütz, Philipp Gasser</p>
            </div>
          </div>

          {/* Column 2 — Links */}
          <div>
            <h3 className="text-xs font-bold tracking-[0.2em] text-white/60">
              LINKS
            </h3>
            <ul className="mt-3 space-y-1 text-xs text-white/40">
              <li>
                <Link
                  href="/shop"
                  className="transition-colors hover:text-white/70"
                >
                  Shop
                </Link>
              </li>
              <li>
                <Link
                  href="/impressum"
                  className="transition-colors hover:text-white/70"
                >
                  Impressum
                </Link>
              </li>
              <li>
                <Link
                  href="/datenschutz"
                  className="transition-colors hover:text-white/70"
                >
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link
                  href="/rueckerstattung"
                  className="transition-colors hover:text-white/70"
                >
                  Rückerstattung &amp; Rückgabe
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={openCookieSettings}
                  className="cursor-pointer bg-transparent border-none p-0 text-xs text-white/40 transition-colors hover:text-white/70"
                >
                  Cookie Einstellungen
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3 — Kontakt */}
          <div>
            <h3 className="text-xs font-bold tracking-[0.2em] text-white/60">
              KONTAKT
            </h3>
            <div className="mt-3 space-y-1 text-xs leading-relaxed text-white/40">
              <p>
                E-Mail:{" "}
                <a
                  href="mailto:office@uncuttv.at"
                  className="transition-colors hover:text-white/70"
                >
                  office@uncuttv.at
                </a>
              </p>
              <p>WKÖ Mitglied: Filmproduktion</p>
              <p>Aufsichtsbehörde: BH Innsbruck-Land</p>
              <p>
                OS-Plattform:{" "}
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white/70"
                >
                  ec.europa.eu/consumers/odr
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom — Copyright */}
        <div className="mt-8 border-t border-[#222] pt-4">
          <p className="text-center text-[11px] tracking-wider text-white/30">
            &copy; 2026 UncutTV GmbH &middot; Axams, Tirol
          </p>
        </div>
      </div>
    </footer>
  );
}
