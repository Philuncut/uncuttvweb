<?php
/**
 * UncutTV override — PDF Invoices & Packing Slips, Simple Premium template, invoice.
 *
 * Deploy to (catch-shop-dark):
 *   wp-content/themes/catch-shop-dark/woocommerce/pdf/Simple Premium/invoice.php
 *   (folder name must match template setting exactly, including the space)
 *
 * Upstream base:
 *   wp-content/plugins/woocommerce-pdf-ips-templates/templates/Simple Premium/invoice.php
 *
 * Only change vs upstream: totals <tfoot> calls uncuttv_pdf_render_invoice_totals_rows()
 * (defined in WPCode snippet uncuttv-pdf-baked-coupon-display.php).
 *
 * If your server copy differs (thumbnails, extra columns, footer): copy the plugin file
 * to the theme first, then apply only the totals block from
 * docs/wordpress/pdf-templates/Simple Premium/totals-tfoot-uncuttv.inc.php
 */
if (!defined('ABSPATH')) {
    exit;
}

do_action('wpo_wcpdf_before_document', $this->get_type(), $this->order);

?>

<table class="head container">
	<tr>
		<td class="header">
			<?php if ($this->has_header_logo()) : ?>
				<?php do_action('wpo_wcpdf_before_shop_logo', $this->get_type(), $this->order); ?>
				<?php $this->header_logo(); ?>
				<?php do_action('wpo_wcpdf_after_shop_logo', $this->get_type(), $this->order); ?>
			<?php else : ?>
				<?php $this->title(); ?>
			<?php endif; ?>
		</td>
		<td class="shop-info">
			<?php do_action('wpo_wcpdf_before_shop_name', $this->get_type(), $this->order); ?>
			<div class="shop-name"><h3><?php $this->shop_name(); ?></h3></div>
			<?php do_action('wpo_wcpdf_after_shop_name', $this->get_type(), $this->order); ?>
			<?php do_action('wpo_wcpdf_before_shop_address', $this->get_type(), $this->order); ?>
			<div class="shop-address"><?php $this->shop_address(); ?></div>
			<?php do_action('wpo_wcpdf_after_shop_address', $this->get_type(), $this->order); ?>
			<?php do_action('wpo_wcpdf_before_shop_phone_number', $this->get_type(), $this->order); ?>
			<?php if (!empty($this->get_shop_phone_number())) : ?>
				<div class="shop-phone-number"><?php $this->shop_phone_number(); ?></div>
			<?php endif; ?>
			<?php do_action('wpo_wcpdf_after_shop_phone_number', $this->get_type(), $this->order); ?>
			<?php if (!empty($this->get_shop_email_address())) : ?>
				<div class="shop-email-address"><?php $this->shop_email_address(); ?></div>
			<?php endif; ?>
			<?php do_action('wpo_wcpdf_after_shop_email_address', $this->get_type(), $this->order); ?>
		</td>
	</tr>
</table>

<?php do_action('wpo_wcpdf_before_document_label', $this->get_type(), $this->order); ?>

<?php if ($this->has_header_logo()) : ?>
	<h1 class="document-type-label"><?php $this->title(); ?></h1>
<?php endif; ?>

<?php do_action('wpo_wcpdf_after_document_label', $this->get_type(), $this->order); ?>

<table class="order-data-addresses">
	<tr>
		<td class="address billing-address">
			<?php do_action('wpo_wcpdf_before_billing_address', $this->get_type(), $this->order); ?>
			<p><?php $this->billing_address(); ?></p>
			<?php do_action('wpo_wcpdf_after_billing_address', $this->get_type(), $this->order); ?>
			<?php if (isset($this->settings['display_email'])) : ?>
				<div class="billing-email"><?php $this->billing_email(); ?></div>
			<?php endif; ?>
			<?php if (isset($this->settings['display_phone'])) : ?>
				<div class="billing-phone"><?php $this->billing_phone(); ?></div>
			<?php endif; ?>
		</td>
		<td class="address shipping-address">
			<?php if ($this->show_shipping_address()) : ?>
				<h3><?php $this->shipping_address_title(); ?></h3>
				<?php do_action('wpo_wcpdf_before_shipping_address', $this->get_type(), $this->order); ?>
				<p><?php $this->shipping_address(); ?></p>
				<?php do_action('wpo_wcpdf_after_shipping_address', $this->get_type(), $this->order); ?>
				<?php if (isset($this->settings['display_phone'])) : ?>
					<div class="shipping-phone"><?php $this->shipping_phone(); ?></div>
				<?php endif; ?>
			<?php endif; ?>
		</td>
		<td class="order-data">
			<table>
				<?php do_action('wpo_wcpdf_before_order_data', $this->get_type(), $this->order); ?>
				<?php if (isset($this->settings['display_number'])) : ?>
					<tr class="invoice-number">
						<th><?php $this->number_title(); ?></th>
						<td><?php $this->number($this->get_type()); ?></td>
					</tr>
				<?php endif; ?>
				<?php if (isset($this->settings['display_date'])) : ?>
					<tr class="invoice-date">
						<th><?php $this->date_title(); ?></th>
						<td><?php $this->date($this->get_type()); ?></td>
					</tr>
				<?php endif; ?>
				<?php if ($this->show_due_date()) : ?>
					<tr class="due-date">
						<th><?php $this->due_date_title(); ?></th>
						<td><?php $this->due_date(); ?></td>
					</tr>
				<?php endif; ?>
				<tr class="order-number">
					<th><?php $this->order_number_title(); ?></th>
					<td><?php $this->order_number(); ?></td>
				</tr>
				<tr class="order-date">
					<th><?php $this->order_date_title(); ?></th>
					<td><?php $this->order_date(); ?></td>
				</tr>
				<?php if ($this->get_payment_method()) : ?>
					<tr class="payment-method">
						<th><?php $this->payment_method_title(); ?></th>
						<td><?php $this->payment_method(); ?></td>
					</tr>
				<?php endif; ?>
				<?php do_action('wpo_wcpdf_after_order_data', $this->get_type(), $this->order); ?>
			</table>
		</td>
	</tr>
</table>

<?php do_action('wpo_wcpdf_before_order_details', $this->get_type(), $this->order); ?>

<table class="order-details">
	<thead>
		<tr>
			<?php foreach (wpo_wcpdf_get_simple_template_default_table_headers($this) as $column_class => $column_title) : ?>
				<th class="<?php echo esc_attr($column_class); ?>"><?php echo esc_html($column_title); ?></th>
			<?php endforeach; ?>
		</tr>
	</thead>
	<tbody>
		<?php foreach ($this->get_order_items() as $item_id => $item) : ?>
			<tr class="<?php echo esc_attr($item['row_class']); ?>">
				<td class="product">
					<p class="item-name"><?php echo esc_html($item['name']); ?></p>
					<?php do_action('wpo_wcpdf_before_item_meta', $this->get_type(), $item, $this->order); ?>
					<div class="item-meta">
						<?php if (!empty($item['sku'])) : ?>
							<p class="sku"><span class="label"><?php $this->sku_title(); ?></span> <?php echo esc_html($item['sku']); ?></p>
						<?php endif; ?>
						<?php if (!empty($item['weight'])) : ?>
							<p class="weight"><span class="label"><?php $this->weight_title(); ?></span> <?php echo esc_html($item['weight']); ?><?php echo esc_html(get_option('woocommerce_weight_unit')); ?></p>
						<?php endif; ?>
						<?php if (!empty($item['meta'])) : ?>
							<?php echo wp_kses_post($item['meta']); ?>
						<?php endif; ?>
					</div>
					<?php do_action('wpo_wcpdf_after_item_meta', $this->get_type(), $item, $this->order); ?>
				</td>
				<td class="quantity"><?php echo esc_html($item['quantity']); ?></td>
				<td class="price"><?php echo esc_html($item['order_price']); ?></td>
			</tr>
		<?php endforeach; ?>
	</tbody>
</table>

<table class="notes-totals">
	<tbody>
		<tr class="no-borders">
			<td class="no-borders notes-cell">
				<?php do_action('wpo_wcpdf_before_document_notes', $this->get_type(), $this->order); ?>
				<?php if ($this->get_document_notes()) : ?>
					<div class="document-notes">
						<h3><?php $this->notes_title(); ?></h3>
						<?php $this->document_notes(); ?>
					</div>
				<?php endif; ?>
				<?php do_action('wpo_wcpdf_after_document_notes', $this->get_type(), $this->order); ?>
				<?php do_action('wpo_wcpdf_before_customer_notes', $this->get_type(), $this->order); ?>
				<?php if ($this->get_shipping_notes()) : ?>
					<div class="customer-notes">
						<h3><?php $this->customer_notes_title(); ?></h3>
						<?php $this->shipping_notes(); ?>
					</div>
				<?php endif; ?>
				<?php do_action('wpo_wcpdf_after_customer_notes', $this->get_type(), $this->order); ?>
			</td>
			<td class="no-borders totals-cell">
				<table class="totals">
					<tfoot>
						<?php
						if (function_exists('uncuttv_pdf_render_invoice_totals_rows')) {
							uncuttv_pdf_render_invoice_totals_rows($this);
						} else {
							foreach ($this->get_woocommerce_totals() as $key => $total) :
								?>
								<tr class="<?php echo esc_attr($key); ?>">
									<th class="description"><?php echo esc_html($total['label']); ?></th>
									<td class="price"><span class="totals-price"><?php echo esc_html($total['value']); ?></span></td>
								</tr>
								<?php
							endforeach;
						}
						?>
					</tfoot>
				</table>
			</td>
		</tr>
	</tbody>
</table>

<?php do_action('wpo_wcpdf_after_order_details', $this->get_type(), $this->order); ?>

<div class="bottom-spacer"></div>

<?php if ($this->get_footer()) : ?>
	<htmlpagefooter name="docFooter">
		<div id="footer">
			<?php $this->footer(); ?>
		</div>
	</htmlpagefooter>
<?php endif; ?>

<?php do_action('wpo_wcpdf_after_document', $this->get_type(), $this->order); ?>
