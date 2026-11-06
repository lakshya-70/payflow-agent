/**
 * get_product_catalog — browse the simulated PayFlow storefront.
 */
import { listCatalog } from "../../catalog/catalog.service.js";
import type { AgentTool, AgentToolContext } from "./types.js";

export const catalogTool: AgentTool = {
  name: "get_product_catalog",
  description:
    "Browse the simulated PayFlow storefront catalog. Returns products with id, name, list price, " +
    "negotiability and the seller's floor price hint. Call this before negotiating or ordering.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Optional keyword filter, e.g. 'keyboard' or 'Peripherals'",
      },
      max_price: {
        type: "number",
        description: "Only return products whose list price is at or below this USD value",
      },
    },
    required: [],
  },

  async execute(args, _context: AgentToolContext): Promise<string> {
    const query = typeof args.query === "string" ? args.query : undefined;
    const maxPrice = typeof args.max_price === "number" ? args.max_price : undefined;
    const products = listCatalog({ query, maxPrice });

    return JSON.stringify(
      {
        count: products.length,
        note: "floor_price = minimum the seller agent may accept; aim below list_price.",
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          description: product.description,
          currency: product.currency,
          list_price: product.listPrice,
          floor_price: product.floorPrice,
          negotiable: product.negotiable,
          stock: product.stock,
        })),
      },
      null,
      2,
    );
  },
};
