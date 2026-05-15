const FLY_MS = 450;
const CLONE_SIZE = 60;
export const CART_TARGET_SELECTOR = "[data-cart-target]";

/**
 * Animates a 60×60 clone of the product image toward the navbar cart icon.
 * Returns false when the cart target is missing (caller may use card flash).
 */
export function flyToCart(sourceImg: HTMLImageElement): boolean {
  const cartEl = document.querySelector<HTMLElement>(CART_TARGET_SELECTOR);
  if (!cartEl) return false;

  const sourceRect = sourceImg.getBoundingClientRect();
  const targetRect = cartEl.getBoundingClientRect();

  const startX = sourceRect.left + sourceRect.width / 2 - CLONE_SIZE / 2;
  const startY = sourceRect.top + sourceRect.height / 2 - CLONE_SIZE / 2;
  const endX = targetRect.left + targetRect.width / 2 - CLONE_SIZE / 2;
  const endY = targetRect.top + targetRect.height / 2 - CLONE_SIZE / 2;

  const clone = document.createElement("img");
  clone.src = sourceImg.currentSrc || sourceImg.src;
  clone.alt = "";
  clone.setAttribute("aria-hidden", "true");
  clone.className = "fly-to-cart-clone";
  clone.style.setProperty("--start-x", `${startX}px`);
  clone.style.setProperty("--start-y", `${startY}px`);
  clone.style.setProperty("--end-x", `${endX}px`);
  clone.style.setProperty("--end-y", `${endY}px`);

  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.classList.add("fly-to-cart-clone--active");
  });

  window.setTimeout(() => clone.remove(), FLY_MS + 50);
  return true;
}
