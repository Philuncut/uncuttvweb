export type Verkaufskanal =
  | ""
  | "Eigenes Ladengeschaeft"
  | "Online-Shop"
  | "Beides (Laden + Online)"
  | "Messen / Maerkte"
  | "Sonstiges";

export interface HaendlerAnfrageBody {
  firmenname: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  land: string;
  adresse: string;
  uid: string;
  website: string;
  verkaufskanal: Verkaufskanal;
}
