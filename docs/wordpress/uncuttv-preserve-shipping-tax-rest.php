<?php
/**
 * UncutTV: Preserve explicit shipping_lines.total_tax from REST API
 *
 * WooCommerce recalculates shipping tax from total × rate when an order
 * is created via REST API, even if explicit total_tax is provided.
 * This causes 1-cent rounding drifts (e.g. DE 19% €7.80 → €7.79).
 *
 * This hook captures the explicit total_tax from the REST request and
 * overrides WC's calculation after order creation.
 *
 * Compatible with WC 10.x (uses set_props instead of protected setters).
 *
 * Install: WordPress Admin → Code Snippets (WPCode) → Add New → PHP Snippet
 * Name: "UncutTV — Preserve Explicit Shipping Tax from REST API"
 * Location: Run Everywhere
 */

defined('ABSPATH') || exit;

add_action('woocommerce_rest_insert_shop_order_object', 'uncuttv_preserve_shipping_tax', 20, 3);

/**
 * @param WC_Order        $order
 * @param WP_REST_Request $request
 * @param bool            $creating
 */
function uncuttv_preserve_shipping_tax($order, $request, $creating) {
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

    $any_changes       = false;
    $payload_indexed   = array_values($shipping_lines_payload);
    $idx               = 0;

    foreach ($order_shipping_items as $shipping_item) {
        if (!($shipping_item instanceof WC_Order_Item_Shipping)) {
            $idx++;
            continue;
        }

        if (!isset($payload_indexed[$idx])) {
            $idx++;
            continue;
        }

        $payload_line = $payload_indexed[$idx];

        if (
            !isset($payload_line['total_tax'])
            || $payload_line['total_tax'] === ''
            || $payload_line['total_tax'] === null
        ) {
            $idx++;
            continue;
        }

        $explicit_tax = (float) wc_format_decimal($payload_line['total_tax']);
        $current_tax  = (float) $shipping_item->get_total_tax();

        if (abs($explicit_tax - $current_tax) < 0.005) {
            $idx++;
            continue;
        }

        $props = array(
            'total_tax' => wc_format_decimal($explicit_tax),
        );

        if (isset($payload_line['taxes']) && is_array($payload_line['taxes'])) {
            $taxes_data = array('total' => array());
            foreach ($payload_line['taxes'] as $tax_entry) {
                if (!is_array($tax_entry) || !isset($tax_entry['id'])) {
                    continue;
                }
                $tax_id    = (int) $tax_entry['id'];
                $tax_total = isset($tax_entry['total'])
                    ? wc_format_decimal($tax_entry['total'])
                    : wc_format_decimal($explicit_tax);
                $taxes_data['total'][$tax_id] = $tax_total;
            }
            if (!empty($taxes_data['total'])) {
                $props['taxes'] = $taxes_data;
            }
        }

        $shipping_item->set_props($props);
        $shipping_item->save();

        $order->add_order_note(
            sprintf(
                'Shipping tax preserved from REST payload: WC calculated %1$s → explicit %2$s',
                wc_format_decimal($current_tax, 4),
                wc_format_decimal($explicit_tax, 4)
            ),
            false,
            false
        );

        $any_changes = true;
        $idx++;
    }

    if ($any_changes) {
        uncuttv_recalc_order_totals_after_shipping_tax_fix($order);
    }
}

/**
 * Re-aggregate tax_lines and set order total from line items (not calculate_totals(false),
 * which leaves order->total stale while item taxes are correct).
 *
 * @param WC_Order $order
 */
function uncuttv_recalc_order_totals_after_shipping_tax_fix($order) {
    if (!is_a($order, 'WC_Order')) {
        return;
    }

    if (method_exists($order, 'update_taxes')) {
        $order->update_taxes();
    }

    $cart_total     = 0.0;
    $cart_tax       = 0.0;
    $shipping_total = 0.0;
    $shipping_tax   = 0.0;

    foreach ($order->get_items('line_item') as $line) {
        $cart_total += (float) $line->get_total();
        $cart_tax   += (float) $line->get_total_tax();
    }

    foreach ($order->get_items('shipping') as $ship) {
        $shipping_total += (float) $ship->get_total();
        $shipping_tax   += (float) $ship->get_total_tax();
    }

    foreach ($order->get_items('fee') as $fee) {
        $cart_total += (float) $fee->get_total();
        $cart_tax   += (float) $fee->get_total_tax();
    }

    $discount_total = (float) $order->get_discount_total();
    $discount_tax   = (float) $order->get_discount_tax();

    $new_total = $cart_total + $cart_tax + $shipping_total + $shipping_tax
        - $discount_total - $discount_tax;

    $order->set_props(
        array(
            'total'          => wc_format_decimal($new_total),
            'shipping_total' => wc_format_decimal($shipping_total),
            'shipping_tax'   => wc_format_decimal($shipping_tax),
            'cart_tax'       => wc_format_decimal($cart_tax),
        )
    );

    $order->save();
}
