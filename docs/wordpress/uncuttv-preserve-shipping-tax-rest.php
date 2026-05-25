<?php
/**
 * UncutTV — Preserve explicit shipping_lines.total_tax from REST API
 *
 * WooCommerce recalculates shipping tax from total × rate when an order is
 * created via REST API, even if explicit total_tax (and taxes[]) are provided.
 * That causes 1-cent rounding drifts (e.g. DE 19% €7.80 → stored €7.79).
 *
 * Install: WordPress Admin → Code Snippets (WPCode) → Add New → PHP Snippet
 * Name: "UncutTV — Preserve Explicit Shipping Tax from REST API"
 * Location: Run Everywhere
 * Paste this file's contents (without the opening <?php if your snippet runner adds it).
 *
 * Pairs with uncuttvweb shipping_lines payload from create-bank-order / wc-order-from-payment.
 */

defined('ABSPATH') || exit;

add_action(
    'woocommerce_rest_insert_shop_order_object',
    'uncuttv_preserve_shipping_tax_from_rest',
    20,
    3
);

/**
 * @param WC_Order           $order
 * @param WP_REST_Request    $request
 * @param bool               $creating
 */
function uncuttv_preserve_shipping_tax_from_rest($order, $request, $creating) {
    if (!$creating || !is_a($order, 'WC_Order')) {
        return;
    }

    $shipping_lines_payload = $request->get_param('shipping_lines');
    if (empty($shipping_lines_payload) || !is_array($shipping_lines_payload)) {
        return;
    }

    $order_shipping_items = $order->get_items('shipping');
    if (empty($order_shipping_items)) {
        return;
    }

    $idx = 0;
    $any_override = false;

    foreach ($order_shipping_items as $shipping_item) {
        if (!is_a($shipping_item, 'WC_Order_Item_Shipping')) {
            $idx++;
            continue;
        }

        if (!isset($shipping_lines_payload[$idx]) || !is_array($shipping_lines_payload[$idx])) {
            $idx++;
            continue;
        }

        $payload_line = $shipping_lines_payload[$idx];

        if (
            !isset($payload_line['total_tax'])
            || $payload_line['total_tax'] === ''
            || $payload_line['total_tax'] === null
        ) {
            $idx++;
            continue;
        }

        $explicit_tax = (float) wc_format_decimal($payload_line['total_tax'], 4);
        $current_tax  = (float) wc_format_decimal($shipping_item->get_total_tax(), 4);

        // ≥ 0.5 cent difference — avoids noise when WC already matches (e.g. RC 0.00).
        if (abs($explicit_tax - $current_tax) < 0.005) {
            $idx++;
            continue;
        }

        $shipping_item->set_total_tax($explicit_tax);

        if (isset($payload_line['taxes']) && is_array($payload_line['taxes'])) {
            $taxes_data = array(
                'total'    => array(),
                'subtotal' => array(),
            );
            foreach ($payload_line['taxes'] as $tax_entry) {
                if (!is_array($tax_entry) || !isset($tax_entry['id'])) {
                    continue;
                }
                $tax_id    = (int) $tax_entry['id'];
                $tax_total = isset($tax_entry['total'])
                    ? (float) wc_format_decimal($tax_entry['total'], 4)
                    : $explicit_tax;
                $taxes_data['total'][$tax_id]    = $tax_total;
                $taxes_data['subtotal'][$tax_id] = $tax_total;
            }
            if (!empty($taxes_data['total'])) {
                $shipping_item->set_taxes($taxes_data);
            }
        }

        $shipping_item->save();
        $any_override = true;

        $order->add_order_note(
            sprintf(
                /* translators: 1: WC-calculated tax, 2: REST payload tax */
                'Shipping tax preserved from REST payload: WC calculated %1$s → explicit %2$s',
                wc_format_decimal($current_tax, 2),
                wc_format_decimal($explicit_tax, 2)
            ),
            false,
            false
        );

        $idx++;
    }

    if ($any_override) {
        // false = do not recalculate line taxes (would undo explicit shipping tax).
        $order->calculate_totals(false);
        $order->save();
    }
}
