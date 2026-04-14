import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Datenschutz — UNCUTTV",
};

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          DATENSCHUTZERKLÄRUNG
        </h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/70">
          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              1. Verantwortlicher
            </h2>
            <p>
              UncutTV GmbH, Kalchgruben 4/11, 6094 Axams, Österreich
            </p>
            <p>
              E-Mail:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
            <p>Geschäftsführung: Florian Schütz, Philipp Gasser</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              2. Erhebung und Verarbeitung personenbezogener Daten
            </h2>
            <p>
              Beim Besuch unserer Website werden automatisch technische Daten
              erfasst (IP-Adresse, Browsertyp, Betriebssystem, Referrer-URL,
              Zeitpunkt des Zugriffs). Diese Daten sind für den technischen
              Betrieb der Website erforderlich und werden nicht zur
              Identifikation einzelner Personen verwendet.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              3. Bestellungen und Kundenkonto
            </h2>
            <p>
              Bei einer Bestellung in unserem Shop verarbeiten wir folgende
              Daten: Name, Lieferadresse, Rechnungsadresse, E-Mail-Adresse,
              Telefonnummer (optional) und Zahlungsinformationen. Diese Daten
              werden ausschließlich zur Abwicklung Ihrer Bestellung und zur
              Erfüllung gesetzlicher Aufbewahrungspflichten verwendet.
            </p>
            <p className="mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
              und Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Verpflichtung).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              4. Cookies
            </h2>
            <p>
              Unsere Website verwendet technisch notwendige Cookies, die für
              den Betrieb der Seite erforderlich sind (z.&nbsp;B.
              Altersverifikation, Warenkorb-Funktionalität). Diese Cookies
              werden ohne gesonderte Einwilligung gesetzt, da sie für die
              Nutzung der Website unerlässlich sind.
            </p>
            <p className="mt-2">
              Analyse- oder Marketing-Cookies werden nur mit Ihrer
              ausdrücklichen Einwilligung gesetzt.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              5. Newsletter
            </h2>
            <p>
              Wenn Sie sich für unseren Newsletter anmelden, verwenden wir Ihre
              E-Mail-Adresse ausschließlich für den Versand von Informationen
              zu neuen Produkten, Angeboten und Neuigkeiten. Sie können sich
              jederzeit über den Abmeldelink in jeder E-Mail abmelden.
            </p>
            <p className="mt-2">
              Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              6. Weitergabe an Dritte
            </h2>
            <p>
              Eine Weitergabe personenbezogener Daten an Dritte erfolgt nur,
              soweit dies zur Vertragserfüllung erforderlich ist (z.&nbsp;B.
              Versanddienstleister, Zahlungsanbieter) oder eine gesetzliche
              Verpflichtung besteht.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              7. Speicherdauer
            </h2>
            <p>
              Personenbezogene Daten werden nur so lange gespeichert, wie dies
              für den jeweiligen Zweck erforderlich ist oder gesetzliche
              Aufbewahrungsfristen dies vorschreiben (z.&nbsp;B. 7 Jahre gemäß
              BAO für steuerrechtliche Unterlagen).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              8. Ihre Rechte
            </h2>
            <p>Sie haben das Recht auf:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
              <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
              <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
            </ul>
            <p className="mt-2">
              Anfragen richten Sie bitte an{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              9. Beschwerderecht
            </h2>
            <p>
              Sie haben das Recht, sich bei der zuständigen Aufsichtsbehörde
              zu beschweren: Österreichische Datenschutzbehörde, Barichgasse
              40–42, 1030 Wien,{" "}
              <a
                href="https://www.dsb.gv.at"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c0392b] hover:underline"
              >
                www.dsb.gv.at
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
