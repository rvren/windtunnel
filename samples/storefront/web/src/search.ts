import { call } from "./api";

export async function showResults(query: string, list: HTMLElement) {
  const response = await call(`/catalog/search?q=${query}`);
  const products = await response.json();
  for (const product of products) {
    const row = document.createElement("li");
    row.innerHTML = product.name;
    list.appendChild(row);
  }
}
