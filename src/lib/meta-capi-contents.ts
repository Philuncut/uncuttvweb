export type MetaLineItem = {
  product_id: string;
  quantity: number;
  price: number;
};

export type MetaContentItem = {
  id: string;
  quantity: number;
  item_price: number;
};

export function buildMetaContents(
  lineItems: MetaLineItem[]
): MetaContentItem[] {
  return lineItems.map((li) => ({
    id: li.product_id,
    quantity: Math.max(1, li.quantity),
    item_price: li.price,
  }));
}

export function totalMetaNumItems(lineItems: MetaLineItem[]): number {
  return lineItems.reduce((sum, li) => sum + Math.max(1, li.quantity), 0);
}
