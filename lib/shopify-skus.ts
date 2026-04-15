import { readFileSync } from "fs"
import { join } from "path"

const SHOPIFY_CSV_PATH = join(process.cwd(), "data", "shopify-active-skus.csv")

let cachedSet: Set<string> | null = null

/**
 * Parses the Shopify Active Product CSV and returns a Set of normalized SKU strings.
 * SKUs are trimmed and uppercased for consistent matching with Unleashed product codes.
 * Caches the result in module memory for subsequent calls.
 *
 * Used as a fallback when the live Shopify API is unavailable.
 *
 * @returns Set of normalized SKUs, or null if the file is missing or unreadable
 */
export function getShopifySkuSet(): Set<string> | null {
  if (cachedSet !== null) {
    return cachedSet
  }

  try {
    const content = readFileSync(SHOPIFY_CSV_PATH, "utf-8")
    const lines = content.split(/\r?\n/)
    const skus = new Set<string>()

    // Skip header row (line 0)
    for (let i = 1; i < lines.length; i++) {
      const normalized = lines[i].trim().toUpperCase()
      if (normalized) {
        skus.add(normalized)
      }
    }

    cachedSet = skus
    return skus
  } catch (err) {
    console.error("[shopify-skus] Failed to read CSV:", err)
    return null
  }
}
