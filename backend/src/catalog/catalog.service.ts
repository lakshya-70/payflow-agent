/**
 * Catalog service — the agent's window onto the storefront inventory.
 */
import { CATALOG, type CatalogProduct } from "./products.js";

/** List products with optional keyword + max-price filters. */
export function listCatalog(options: { query?: string; maxPrice?: number } = {}): CatalogProduct[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  return CATALOG.filter((product) => {
    const matchesQuery =
      query.length === 0 ||
      `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    const matchesPrice = options.maxPrice == null || product.listPrice <= options.maxPrice;
    return matchesQuery && matchesPrice;
  });
}

/** Find one product by id (case-insensitive tolerance for model-typed ids). */
export function findProduct(productId: string): CatalogProduct | undefined {
  const id = productId.trim().toLowerCase();
  return CATALOG.find((product) => product.id.toLowerCase() === id);
}
