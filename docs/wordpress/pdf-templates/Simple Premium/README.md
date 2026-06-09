# Simple Premium PDF template (UncutTV totals patch)

Production uses **Simple Premium** from `woocommerce-pdf-ips-templates` and theme **catch-shop-dark**.

Licensed upstream files are **not** in this repo. Deploy from the server plugin copy.

## Paths (wp.uncuttv.at)

| | Path |
|---|------|
| Plugin original | `wp-content/plugins/woocommerce-pdf-ips-templates/templates/Simple Premium/` |
| Theme override | `wp-content/themes/catch-shop-dark/woocommerce/pdf/Simple Premium/` |

Folder name **`Simple Premium`** must match WooCommerce → PDF Invoices → General → Template (including the space).

## Deploy (recommended — keeps thumbnails / Premium layout)

1. On the server, copy the entire plugin template folder to the theme:

   ```bash
   THEME=wp-content/themes/catch-shop-dark
   SRC=wp-content/plugins/woocommerce-pdf-ips-templates/templates/Simple\ Premium
   DST=$THEME/woocommerce/pdf/Simple\ Premium
   mkdir -p "$DST"
   cp -a "$SRC"/. "$DST"/
   ```

2. **WPCode (required):** update from [`uncuttv-pdf-baked-coupon-display.php`](../uncuttv-pdf-baked-coupon-display.php) and activate. Totals use filter `wpo_wcpdf_templates_totals` (works with Premium `wpo_wcpdf_templates_get_totals()`).

3. **Optional:** edit `$DST/invoice.php` totals block — see patched copy under repo `Simple Premium/invoice.php` or [`totals-tfoot-uncuttv.inc.php`](./totals-tfoot-uncuttv.inc.php) (adapt `<tbody>` + `wpo_wcpdf_templates_get_totals` fallback, not only legacy `<tfoot>`).

4. Remove a wrong override if present: `woocommerce/pdf/Simple/invoice.php` (free template — not used).

5. Regenerate a test invoice PDF (delete cached attachment on the order if needed).

## Deploy (alternative — full file from repo)

If a diff shows the server `invoice.php` matches the free **Simple** layout (`notes-totals`, `wpo_wcpdf_get_simple_template_default_table_headers`, no extra product-image column), you may copy the repo override as-is:

[`theme-override/woocommerce/pdf/Simple Premium/invoice.php`](../../theme-override/woocommerce/pdf/Simple%20Premium/invoice.php)

If thumbnails or footer columns disappear after deploy, roll back and use the **recommended** patch on the server copy instead.

## Expected PDF (DE B2C + welcome10)

- Line items: list gross (€40,90 / €13,90 / …) — WPCode filter
- Zwischensumme: **€125,60**
- **Rabatt (WELCOME10): −€12,56**
- Gesamtsumme: **€113,04** (unchanged)

See [`WPCODE_SNIPPETS.md`](../WPCODE_SNIPPETS.md) for full test plan.
