export async function loadShopifySkus(): Promise<Set<string>> {
  const res = await fetch("/data/shopify-active-skus.csv")
  const text = await res.text()

  const lines = text.split("\n")

  // Remove header
  const skus = lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)

  return new Set(skus)
}
