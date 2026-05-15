export function invoiceErrorMessage(
  status: number,
  fallback?: string
): string {
  switch (status) {
    case 404:
      return "Rechnung wurde noch nicht generiert. Bitte später erneut versuchen.";
    case 403:
      return "Kein Zugriff auf diese Rechnung.";
    case 502:
      return "WooCommerce nicht erreichbar. Bitte später erneut versuchen.";
    default:
      return (
        fallback ??
        "Fehler beim Abrufen der Rechnung. Bitte später erneut versuchen."
      );
  }
}
