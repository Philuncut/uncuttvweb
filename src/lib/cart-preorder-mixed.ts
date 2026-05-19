import type { CartItem } from "@/lib/CartContext";
import { productHasPreOrderCategory } from "@/lib/stock-display";

/** True when cart has at least one pre-order and one non–pre-order line (mixed shipment). */
export function cartHasMixedPreOrder(items: CartItem[]): boolean {
  if (items.length === 0) return false;

  let hasPreOrder = false;
  let hasNonPreOrder = false;

  for (const { product } of items) {
    if (productHasPreOrderCategory(product.categories)) {
      hasPreOrder = true;
    } else {
      hasNonPreOrder = true;
    }
    if (hasPreOrder && hasNonPreOrder) return true;
  }

  return false;
}
