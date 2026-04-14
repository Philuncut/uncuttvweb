import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Impressum — UNCUTTV",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="border-l-4 border-[#c0392b] pl-4 text-lg font-black text-white sm:text-2xl sm:tracking-[0.1em] md:text-3xl md:tracking-[0.15em]">
          IMPRESSUM
        </h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/70">
          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Angaben gemäß § 5 ECG
            </h2>
            <p>UncutTV GmbH</p>
            <p>Kalchgruben 4/11</p>
            <p>6094 Axams, Österreich</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">Kontakt</h2>
            <p>
              E-Mail:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
            <p>
              Web:{" "}
              <a
                href="https://www.uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                www.uncuttv.at
              </a>
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Unternehmensgegenstand
            </h2>
            <p>
              Handel mit Filmen und verwandten Medienprodukten, Medien und
              Filmproduktion.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Firmenbuchdaten
            </h2>
            <p>Firmenbuchnummer: FN 643542 k</p>
            <p>Firmenbuchgericht: Landesgericht Innsbruck</p>
            <p>UID-Nummer: ATU 815 26 957</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Geschäftsführung
            </h2>
            <p>Florian Schütz und Philipp Gasser</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Kammermitgliedschaft
            </h2>
            <p>WKÖ — Fachgruppe Filmproduktion</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Aufsichtsbehörde
            </h2>
            <p>Bezirkshauptmannschaft Innsbruck-Land</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-white">
              Online-Streitbeilegung
            </h2>
            <p>
              Verbraucher haben die Möglichkeit, Beschwerden an die
              Online-Streitbeilegungsplattform der EU zu richten:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c0392b] hover:underline"
              >
                https://ec.europa.eu/consumers/odr
              </a>
            </p>
            <p className="mt-2">
              E-Mail für Beschwerden:{" "}
              <a
                href="mailto:office@uncuttv.at"
                className="text-[#c0392b] hover:underline"
              >
                office@uncuttv.at
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
