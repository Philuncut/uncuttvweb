<?php if ( ! defined( 'ABSPATH' ) ) exit; // Exit if accessed directly ?>

<?php do_action( 'wpo_wcpdf_before_document', $this->get_type(), $this->order ); ?>

<table class="head container">
	<tr>
		<td class="header">
			<?php if ( $this->has_header_logo() ) : ?>
				<?php do_action( 'wpo_wcpdf_before_shop_logo', $this->get_type(), $this->order ); ?>
				<?php $this->header_logo(); ?>
				<?php do_action( 'wpo_wcpdf_after_shop_logo', $this->get_type(), $this->order ); ?>
			<?php else : ?>
				<?php $this->title(); ?>
			<?php endif; ?>
		</td>
		<td class="shop-info">
			<?php do_action( 'wpo_wcpdf_before_shop_name', $this->get_type(), $this->order ); ?>
			<div class="shop-name"><h3><?php $this->shop_name(); ?></h3></div>
			<?php do_action( 'wpo_wcpdf_after_shop_name', $this->get_type(), $this->order ); ?>
			<?php do_action( 'wpo_wcpdf_before_shop_address', $this->get_type(), $this->order ); ?>
			<div class="shop-address"><?php $this->shop_address(); ?></div>
			<?php do_action( 'wpo_wcpdf_after_shop_address', $this->get_type(), $this->order ); ?>
 			<?php do_action( 'wpo_wcpdf_before_shop_phone_number', $this->get_type(), $this->order ); ?>
			<?php if ( ! empty( $this->get_shop_phone_number() ) ) : ?>
				<div class="shop-phone-number"><?php $this->shop_phone_number(); ?></div>
			<?php endif; ?>
			<?php do_action( 'wpo_wcpdf_after_shop_phone_number', $this->get_type(), $this->order ); ?>
			<?php if ( ! empty( $this->get_shop_email_address() ) ) : ?>
				<div class="shop-email-address"><?php $this->shop_email_address(); ?></div>
			<?php endif; ?>
			<?php do_action( 'wpo_wcpdf_after_shop_email_address', $this->get_type(), $this->order ); ?>
		</td>
	</tr>
</table>

<?php do_action( 'wpo_wcpdf_before_document_label', $this->get_type(), $this->order ); ?>

<?php if ( $this->has_header_logo() ) : ?>
	<h1 class="document-type-label"><?php $this->title(); ?></h1>
<?php endif; ?>

<?php do_action( 'wpo_wcpdf_after_document_label', $this->get_type(), $this->order ); ?>

<table class="order-data-addresses">
	<tr>
		<td class="address billing-address">
			<?php do_action( 'wpo_wcpdf_before_billing_address', $this->get_type(), $this->order ); ?>
			<p><?php $this->billing_address(); ?></p>
			<?php do_action( 'wpo_wcpdf_after_billing_address', $this->get_type(), $this->order ); ?>
			<?php if ( isset( $this->settings['display_email'] ) ) : ?>
				<div class="billing-email"><?php $this->billing_email(); ?></div>
			<?php endif; ?>
			<?php if ( isset( $this->settings['display_phone'] ) ) : ?>
				<div class="billing-phone"><?php $this->billing_phone(); ?></div>
			<?php endif; ?>
		</td>
		<td class="address shipping-address">
			<?php if ( $this->show_shipping_address() ) : ?>
				<h3><?php $this->shipping_address_title(); ?></h3>
				<?php do_action( 'wpo_wcpdf_before_shipping_address', $this->get_type(), $this->order ); ?>
				<p><?php $this->shipping_address(); ?></p>
				<?php do_action( 'wpo_wcpdf_after_shipping_address', $this->get_type(), $this->order ); ?>
				<?php if ( isset( $this->settings['display_phone'] ) ) : ?>
					<div class="shipping-phone"><?php $this->shipping_phone(); ?></div>
				<?php endif; ?>
			<?php endif; ?>
		</td>
		<td class="order-data">
			<table>
				<?php do_action( 'wpo_wcpdf_before_order_data', $this->get_type(), $this->order ); ?>
				<?php if ( isset( $this->settings['display_number'] ) ) : ?>
					<tr class="proforma-number">
						<th><?php $this->number_title(); ?></th>
						<td><?php $this->number( $this->get_type() ); ?></td>
					</tr>
				<?php endif; ?>
				<?php if ( isset( $this->settings['display_date'] ) ) : ?>
					<tr class="proforma-date">
						<th><?php $this->date_title(); ?></th>
						<td><?php $this->date( $this->get_type() ); ?></td>
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
				<?php if ( ! empty( $this->get_payment_method() ) ) : ?>
					<tr class="payment-method">
						<th><?php $this->payment_method_title(); ?></th>
						<td><?php $this->payment_method(); ?></td>
					</tr>
				<?php endif; ?>
				<?php do_action( 'wpo_wcpdf_after_order_data', $this->get_type(), $this->order ); ?>
			</table>			
		</td>
	</tr>
</table>

<?php do_action( 'wpo_wcpdf_before_order_details', $this->get_type(), $this->order ); ?>

<table class="order-details">
	<thead>
		<tr>
			<?php foreach ( wpo_wcpdf_templates_get_table_headers( $this ) as $column_key => $header_data ) : ?>
				<th class="<?php echo esc_attr( $header_data['class'] ); ?>"<?php echo wpo_wcpdf_templates_maybe_apply_column_styles( $header_data, 'header' ); ?>><?php echo esc_html( $header_data['title'] ); ?></th>
			<?php endforeach; ?>
		</tr>
	</thead>
	<tbody>
		<?php foreach ( wpo_wcpdf_templates_get_table_body( $this ) as $item_id => $item_columns ) : ?>
			<?php do_action( 'wpo_wcpdf_templates_before_order_details_row', $this, $item_id, $item_columns ); ?>
			<?php $row_class = apply_filters( 'wpo_wcpdf_item_row_class', "item-{$item_id}", $this->get_type(), $this->order, $item_id ); ?>
			<tr class="<?php echo esc_attr( $row_class ) ?>">
				<?php foreach ( $item_columns as $column_key => $column_data ) : ?>
					<td class="<?php echo esc_attr( $column_data['class'] ); ?>"<?php echo wpo_wcpdf_templates_maybe_apply_column_styles( $column_data, 'cells' ); ?>><span><?php echo esc_html( $column_data['data'] ); ?></span></td>
				<?php endforeach; ?>
			</tr>
			<?php do_action( 'wpo_wcpdf_templates_after_order_details_row', $this, $item_id, $item_columns ); ?>
		<?php endforeach; ?>
	</tbody>
</table>

<div class="notes-totals-container">
	<div class="totals">
		<table>
			<tbody>
				<?php foreach ( wpo_wcpdf_templates_get_totals( $this ) as $total_key => $total_data ) : ?>
					<tr class="<?php echo esc_attr( $total_data['class'] ); ?>">
						<th class="description"><span><?php echo esc_html( $total_data['label'] ); ?></span></th>
						<td class="price"><span class="totals-price"><?php echo esc_html( $total_data['value'] ); ?></span></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	</div>
	<div class="notes">
		<div class="no-borders wrapper">
			<?php do_action( 'wpo_wcpdf_before_customer_notes', $this->get_type(), $this->order ); ?>
			<div class="customer-notes">
				<?php if ( $this->get_shipping_notes() ) : ?>
					<h3><?php $this->customer_notes_title(); ?></h3>
					<?php $this->shipping_notes(); ?>
				<?php endif; ?>
			</div>				
			<?php do_action( 'wpo_wcpdf_after_customer_notes', $this->get_type(), $this->order ); ?>
		</div>
	</div>
</div>

<div class="bottom-spacer"></div>

<?php do_action( 'wpo_wcpdf_after_order_details', $this->get_type(), $this->order ); ?>

<?php if ( $this->get_footer() ) : ?>
	<htmlpagefooter name="docFooter"><!-- required for mPDF engine -->
		<div id="footer">
			<!-- hook available: wpo_wcpdf_before_footer -->
			<?php $this->footer(); ?>
			<!-- hook available: wpo_wcpdf_after_footer -->
		</div>
	</htmlpagefooter><!-- required for mPDF engine -->
<?php endif; ?>

<?php do_action( 'wpo_wcpdf_after_document', $this->get_type(), $this->order ); ?>