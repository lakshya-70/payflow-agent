/**
 * GET /api/catalog — expose the simulated storefront for Postman/UI consumption.
 */
import { Router } from "express";

import { listCatalog } from "../catalog/catalog.service.js";

export const catalogRoutes = Router();

catalogRoutes.get("/catalog", (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const maxPriceRaw = typeof req.query.max_price === "string" ? Number(req.query.max_price) : undefined;
  const products = listCatalog({ query, maxPrice: Number.isFinite(maxPriceRaw) ? maxPriceRaw : undefined });

  res.json({
    count: products.length,
    products,
  });
});
