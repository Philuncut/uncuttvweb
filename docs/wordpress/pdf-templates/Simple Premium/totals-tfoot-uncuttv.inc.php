<?php
/**
 * Replace the <tfoot> body inside <table class="totals"> in Simple Premium/invoice.php.
 *
 * Find upstream block (inside notes-totals → totals-cell → table.totals → tfoot):
 *   foreach ( $this->get_woocommerce_totals() as $key => $total )
 *
 * Paste this file's inner PHP (between tfoot tags) after copying the plugin template
 * folder to the theme. Requires WPCode snippet uncuttv-pdf-baked-coupon-display.php.
 */
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
