import { call } from "./api";

export async function placeOrder(cart: { items: unknown[]; total: number }) {
  const response = await call("/orders", {
    items: cart.items,
    total: cart.total,
  });
  return response.json();
}
