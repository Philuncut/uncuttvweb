<?php
/**
 * UncutTV: PDF display for EU B2C (non-AT) orders with baked coupon line totals
 *
 * Next.js stores discounted amounts in WC line_items (no coupon_lines). PDFs would
 * otherwise show reduced prices with no discount row. This snippet restores list
 * prices on line items (filter). Totals (Zwischensumme + Rabatt row) via
 * wpo_wcpdf_templates_totals (Simple Premium default path) and/or theme override
 * calling uncuttv_pdf_render_invoice_totals_rows().
 *
 * Does NOT affect: AT-B2C (coupon_lines + WC discount row), wholesale RC, third country,
 * orders without _uncuttv_applied_coupon meta.
 *
 * Install: WPCode → Add New → PHP Snippet
 * Name: "UncutTV — PDF list prices + Rabatt row (baked EU coupon)"
 * Location: Run Everywhere
 */

defined('ABSPATH') || exit;

/**
 * EU countries with standard B2C VAT (matches uncuttvweb eu-vat-rates.ts).
 *
 * @return string[]
 */
function uncuttv_pdf_eu_vat_countries(): array
{
    return array(
        'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
        'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
    );
}

/**
 * @param WC_Order|mixed $order
 */
function uncuttv_pdf_is_baked_eu_b2c_coupon_order($order): bool
{
    if (!($order instanceof WC_Order)) {
        return false;
    }

    $coupon = $order->get_meta('_uncuttv_applied_coupon');
    if (!is_string($coupon) || trim($coupon) === '') {
        return false;
    }

    if ($order->get_meta('_uncuttv_third_country') === 'yes') {
        return false;
    }

    if ($order->get_meta('_uncuttv_reverse_charge') === 'yes') {
        return false;
    }

    $country = strtoupper((string) $order->get_billing_country());
    if ($country === 'AT' || !in_array($country, uncuttv_pdf_eu_vat_countries(), true)) {
        return false;
    }

    $discount_eur = (float) $order->get_meta('_uncuttv_applied_coupon_discount_eur');
    return $discount_eur > 0;
}

/**
 * Proportional gross uplift (same math as uncuttvweb allocateDiscountCentsToLines).
 *
 * @param array<int|string, int> $line_discounted_gross_cents
 * @return array<int|string, int>
 */
function uncuttv_pdf_allocate_original_gross_cents(array $line_discounted_gross_cents, int $discount_gross_cents): array
{
    $discounted_total = array_sum($line_discounted_gross_cents);
    if ($discounted_total <= 0 || $discount_gross_cents <= 0) {
        return $line_discounted_gross_cents;
    }

    $original_total = $discounted_total + $discount_gross_cents;
    $original = array();

    foreach ($line_discounted_gross_cents as $id => $cents) {
        $original[$id] = (int) round($cents * $original_total / $discounted_total);
    }

    $diff = $original_total - array_sum($original);
    if ($diff !== 0) {
        $max_id = array_keys($line_discounted_gross_cents, max($line_discounted_gross_cents), true)[0];
        $original[$max_id] += $diff;
    }

    return $original;
}

/**
 * @param WC_Order $order
 */
function uncuttv_pdf_format_order_amount(WC_Order $order, float $amount): string
{
    return wp_strip_all_tags(
        wc_price($amount, array('currency' => $order->get_currency()))
    );
}

/**
 * Line gross (incl. tax) from stored WC order item.
 *
 * @param WC_Order_Item_Product $item
 */
function uncuttv_pdf_line_gross_cents($item): int
{
    $net = (float) $item->get_total();
    $tax = (float) $item->get_total_tax();
    return (int) round(($net + $tax) * 100);
}

/**
 * @param WC_Order_Item_Product $item
 * @param float                 $original_line_gross line gross incl. tax (pre-discount)
 */
function uncuttv_pdf_format_line_display_amount(WC_Order $order, $item, float $original_line_gross): string
{
    $discounted_gross = ((float) $item->get_total()) + ((float) $item->get_total_tax());
    if ($discounted_gross <= 0) {
        return uncuttv_pdf_format_order_amount($order, $original_line_gross);
    }

    $ratio = $original_line_gross / $discounted_gross;
    $tax_display = get_option('woocommerce_tax_display_cart');

    if ($tax_display === 'excl') {
        $amount = ((float) $item->get_total()) * $ratio;
    } else {
        $amount = $original_line_gross;
    }

    return uncuttv_pdf_format_order_amount($order, $amount);
}

/**
 * @param WC_Order_Item_Product $item
 * @param float                 $original_line_gross
 */
function uncuttv_pdf_format_unit_display_amount(WC_Order $order, $item, float $original_line_gross): string
{
    $qty = max(1, abs((int) $item->get_quantity()));
    $discounted_gross = ((float) $item->get_total()) + ((float) $item->get_total_tax());
    if ($discounted_gross <= 0) {
        return uncuttv_pdf_format_order_amount($order, $original_line_gross / $qty);
    }

    $ratio = $original_line_gross / $discounted_gross;
    $tax_display = get_option('woocommerce_tax_display_cart');

    if ($tax_display === 'excl') {
        $amount = ((float) $item->get_total()) * $ratio / $qty;
    } else {
        $amount = $original_line_gross / $qty;
    }

    return uncuttv_pdf_format_order_amount($order, $amount);
}

/**
 * @param WC_Order $order
 * @return array{item_ids: int[], discounted_sum: float, discount_gross: float}
 */
function uncuttv_pdf_baked_coupon_context(WC_Order $order): array
{
    $discount_gross = (float) $order->get_meta('_uncuttv_applied_coupon_discount_eur');
    $discounted_sum = 0.0;
    $item_ids = array();

    foreach ($order->get_items() as $item_id => $item) {
        if (!($item instanceof WC_Order_Item_Product)) {
            continue;
        }
        $item_ids[] = (int) $item_id;
        $discounted_sum += (float) $item->get_total() + (float) $item->get_total_tax();
    }

    return array(
        'item_ids' => $item_ids,
        'discounted_sum' => $discounted_sum,
        'discount_gross' => $discount_gross,
    );
}

add_filter('wpo_wcpdf_order_items_data', 'uncuttv_pdf_order_items_data_baked_coupon', 20, 3);

/**
 * @param array<int, array<string, mixed>> $items
 * @param WC_Order                         $order
 * @param string                           $document_type
 * @return array<int, array<string, mixed>>
 */
function uncuttv_pdf_order_items_data_baked_coupon(array $items, $order, $document_type)
{
    if ($document_type !== 'invoice' || !uncuttv_pdf_is_baked_eu_b2c_coupon_order($order)) {
        return $items;
    }

    $ctx = uncuttv_pdf_baked_coupon_context($order);
    if ($ctx['discounted_sum'] <= 0 || $ctx['discount_gross'] <= 0) {
        return $items;
    }

    $discounted_cents = array();
    foreach ($order->get_items() as $item_id => $item) {
        if ($item instanceof WC_Order_Item_Product) {
            $discounted_cents[$item_id] = uncuttv_pdf_line_gross_cents($item);
        }
    }

    $discount_cents = (int) round($ctx['discount_gross'] * 100);
    $original_cents = uncuttv_pdf_allocate_original_gross_cents($discounted_cents, $discount_cents);

    foreach ($items as $item_id => &$data) {
        if (!isset($original_cents[$item_id], $data['item']) || !($data['item'] instanceof WC_Order_Item_Product)) {
            continue;
        }

        $wc_item = $data['item'];
        $original_gross = $original_cents[$item_id] / 100;

        $formatted_line = uncuttv_pdf_format_line_display_amount($order, $wc_item, $original_gross);
        $formatted_unit = uncuttv_pdf_format_unit_display_amount($order, $wc_item, $original_gross);

        $data['order_price'] = $formatted_line;
        $data['line_subtotal'] = $formatted_line;
        $data['line_total'] = $formatted_line;
        $data['price'] = $formatted_line;
        $data['single_price'] = $formatted_unit;
        $data['single_line_total'] = $formatted_unit;
    }
    unset($data);

    return $items;
}

/**
 * @param string               $key
 * @param array<string, mixed> $total
 */
function uncuttv_pdf_totals_row_is_subtotal(string $key, array $total): bool
{
    $row_type = isset($total['type']) ? (string) $total['type'] : '';
    if ($row_type === 'subtotal' || $key === 'cart_subtotal' || $key === 'subtotal') {
        return true;
    }

    $class = isset($total['class']) ? (string) $total['class'] : '';
    return $class !== '' && strpos($class, 'subtotal') !== false;
}

/**
 * @param string               $key
 * @param array<string, mixed> $total
 */
function uncuttv_pdf_totals_row_is_discount(string $key, array $total): bool
{
    $row_type = isset($total['type']) ? (string) $total['type'] : '';
    if ($row_type === 'discount' || $key === 'discount') {
        return true;
    }

    $class = isset($total['class']) ? (string) $total['class'] : '';
    return $class !== '' && strpos($class, 'discount') !== false;
}

/**
 * Zwischensumme (list gross) + Rabatt row for baked EU B2C coupon orders.
 *
 * @param WC_Order                    $order
 * @param array<string, array<string, mixed>> $totals
 * @return array<string, array<string, mixed>>
 */
function uncuttv_pdf_adjust_baked_coupon_totals(WC_Order $order, array $totals): array
{
    if (!uncuttv_pdf_is_baked_eu_b2c_coupon_order($order)) {
        return $totals;
    }

    $ctx = uncuttv_pdf_baked_coupon_context($order);
    if ($ctx['discounted_sum'] <= 0 || $ctx['discount_gross'] <= 0) {
        return $totals;
    }

    $original_subtotal = $ctx['discounted_sum'] + $ctx['discount_gross'];
    $coupon_code = strtoupper(trim((string) $order->get_meta('_uncuttv_applied_coupon')));
    $discount_label = sprintf('Rabatt (%s)', $coupon_code);
    $discount_inserted = false;
    $adjusted = array();

    foreach ($totals as $key => $total) {
        if (!is_array($total)) {
            continue;
        }

        if (uncuttv_pdf_totals_row_is_discount((string) $key, $total)) {
            continue;
        }

        if (uncuttv_pdf_totals_row_is_subtotal((string) $key, $total)) {
            $total['value'] = uncuttv_pdf_format_order_amount($order, $original_subtotal);
            $adjusted[(string) $key] = $total;

            if (!$discount_inserted) {
                $adjusted['uncuttv_baked_discount'] = array(
                    'class' => 'discount',
                    'type' => 'discount',
                    'label' => $discount_label,
                    'value' => uncuttv_pdf_format_order_amount($order, -$ctx['discount_gross']),
                );
                $discount_inserted = true;
            }
            continue;
        }

        $adjusted[(string) $key] = $total;
    }

    return $adjusted;
}

add_filter('wpo_wcpdf_templates_totals', 'uncuttv_pdf_templates_totals_baked_coupon', 20, 3);

/**
 * Simple Premium: wpo_wcpdf_templates_get_totals() — works without theme invoice.php override.
 *
 * @param array<string, array<string, mixed>> $totals_data
 * @param string                              $document_type
 * @param object                              $document
 * @return array<string, array<string, mixed>>
 */
function uncuttv_pdf_templates_totals_baked_coupon(array $totals_data, $document_type, $document)
{
    if ($document_type !== 'invoice') {
        return $totals_data;
    }

    $order = $document->order ?? null;
    if (!($order instanceof WC_Order)) {
        return $totals_data;
    }

    return uncuttv_pdf_adjust_baked_coupon_totals($order, $totals_data);
}

/**
 * Render one totals table row (Simple template markup).
 *
 * @param string               $key
 * @param array{label: string, value: string} $total
 */
function uncuttv_pdf_render_invoice_totals_row(string $key, array $total): void
{
    ?>
    <tr class="<?php echo esc_attr($key); ?>">
        <th class="description"><?php echo esc_html($total['label']); ?></th>
        <td class="price"><span class="totals-price"><?php echo esc_html($total['value']); ?></span></td>
    </tr>
    <?php
}

/**
 * Default totals loop (plugin Simple/invoice.php).
 *
 * @param object $document WPO order document ($this in template).
 */
function uncuttv_pdf_render_invoice_totals_rows_default($document): void
{
    foreach ($document->get_woocommerce_totals() as $key => $total) {
        uncuttv_pdf_render_invoice_totals_row((string) $key, $total);
    }
}

/**
 * Totals for EU B2C baked-coupon orders: list subtotal + Rabatt row (display only).
 * Called from theme override woocommerce/pdf/Simple Premium/invoice.php (catch-shop-dark).
 *
 * @param object $document WPO order document ($this in template).
 */
function uncuttv_pdf_render_invoice_totals_rows($document): void
{
    $order = $document->order ?? null;
    if (!($order instanceof WC_Order)) {
        uncuttv_pdf_render_invoice_totals_rows_default($document);
        return;
    }

    $totals = uncuttv_pdf_adjust_baked_coupon_totals($order, $document->get_woocommerce_totals());
    foreach ($totals as $key => $total) {
        if (!is_array($total)) {
            continue;
        }
        uncuttv_pdf_render_invoice_totals_row((string) $key, $total);
    }
}
