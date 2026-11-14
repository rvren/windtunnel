import { API } from "./config";

export async function placeOrder(cart, token) {
  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({ items: cart.items, total: cart.total }),
  });
  return response.json();
}
