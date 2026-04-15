const DEFAULT_SHOPIFY_API_VERSION = "2026-04"
const FETCH_TIMEOUT_MS = 15_000
const TTL_MS = 10 * 60 * 1000 // 10 minutes

interface RawVariant {
  sku?: string | null
  [key: string]: unknown
}

interface RawProduct {
  variants?: RawVariant[] | null
  [key: string]: unknown
}

interface ShopifyApiResponse {
  products?: RawProduct[] | null
}

interface ShopifyVariantSnapshot {
  skuSet: Set<string>
  rawVariantCount: number
}

export function normalizeStoreDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

export function parseLinkHeader(header: string | null): string | null {
  if (!header) return null

  const links = header.split(",")
  for (const linkPart of links) {
    const [rawUrlPart, ...params] = linkPart.split(";")
    if (!rawUrlPart || params.length === 0) continue

    const relParam = params.find((part) => part.trim().startsWith("rel="))
    if (!relParam || !relParam.includes('"next"')) continue

    const trimmed = rawUrlPart.trim()
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      return trimmed.slice(1, -1)
    }
  }

  return null
}

export async function fetchShopifyPage(
  url: string,
  accessToken: string
): Promise<{ products: RawProduct[]; nextUrl: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!response.ok) {
      await response.text().catch(() => "")
      if (response.status === 401)
        throw new Error("Invalid Shopify access token (401)")
      if (response.status === 404)
        throw new Error("Shopify store domain not found (404)")
      throw new Error(`Shopify request failed with status ${response.status}`)
    }

    const payload = (await response.json()) as ShopifyApiResponse
    const products = Array.isArray(payload.products) ? payload.products : []
    const nextUrl = parseLinkHeader(response.headers.get("link"))

    return { products, nextUrl }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Shopify request timed out")
    }
    if (error instanceof Error && /fetch failed/i.test(error.message)) {
      throw new Error("Network failure while connecting to Shopify")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchAllShopifyProducts(
  initialUrl: string,
  accessToken: string
): Promise<{ products: RawProduct[]; pagesFetched: number }> {
  const allProducts: RawProduct[] = []
  let pagesFetched = 0
  let nextUrl: string | null = initialUrl

  while (nextUrl) {
    const { products, nextUrl: parsedNextUrl } = await fetchShopifyPage(
      nextUrl,
      accessToken
    )
    allProducts.push(...products)
    pagesFetched += 1
    nextUrl = parsedNextUrl
  }

  return { products: allProducts, pagesFetched }
}

// ---------------------------------------------------------------------------
// Server-side cache
// ---------------------------------------------------------------------------

let cache: ShopifyVariantSnapshot | null = null
let cacheLastUpdated = 0
let refreshPromise: Promise<ShopifyVariantSnapshot> | null = null

async function buildSkuSnapshot(): Promise<ShopifyVariantSnapshot> {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const rawStoreDomain = process.env.SHOPIFY_STORE_DOMAIN
  const apiVersion =
    process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION

  if (!accessToken || !rawStoreDomain) {
    throw new Error(
      "Missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN env vars"
    )
  }

  const storeDomain = normalizeStoreDomain(rawStoreDomain)
  if (!storeDomain) {
    throw new Error("Invalid SHOPIFY_STORE_DOMAIN env var")
  }

  const url = new URL(
    `https://${storeDomain}/admin/api/${apiVersion}/products.json`
  )
  url.searchParams.set("limit", "250")

  const { products } = await fetchAllShopifyProducts(url.toString(), accessToken)

  const skuSet = new Set<string>()
  let rawVariantCount = 0
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      rawVariantCount += 1
      const raw = variant.sku
      if (!raw) continue
      const normalized = raw.trim().toUpperCase()
      if (normalized) skuSet.add(normalized)
    }
  }

  return {
    skuSet,
    rawVariantCount,
  }
}

/**
 * Returns the full set of Shopify variant SKUs, normalized to UPPER CASE.
 * Cached server-side for 10 minutes. In-flight deduplication prevents
 * concurrent cold-start stampedes.
 */
export async function getShopifyVariantSkuSet(
  forceRefresh = false
): Promise<Set<string>> {
  const now = Date.now()

  if (!forceRefresh && cache && now - cacheLastUpdated < TTL_MS) {
    return cache.skuSet
  }

  if (refreshPromise && !forceRefresh) {
    const snapshot = await refreshPromise
    return snapshot.skuSet
  }

  if (forceRefresh) {
    refreshPromise = null
  }

  refreshPromise = buildSkuSnapshot()
    .then((result) => {
      cache = result
      cacheLastUpdated = Date.now()
      refreshPromise = null
      return result
    })
    .catch((err) => {
      refreshPromise = null
      if (cache) {
        console.warn(
          "[shopify-variant-skus] Refresh failed, serving stale cache:",
          err
        )
        return cache
      }
      throw err
    })

  const snapshot = await refreshPromise
  return snapshot.skuSet
}

/**
 * Returns the Shopify SKU set immediately without blocking:
 * - If cached → returns cached set
 * - If not cached → returns empty set and kicks off background fetch
 * This allows stock fetching to proceed instantly on cold starts.
 */
export function getShopifyVariantSkuSetNonBlocking(): Set<string> {
  if (cache) return cache.skuSet

  if (!refreshPromise) {
    getShopifyVariantSkuSet(false).catch(() => {})
  }

  return new Set()
}

export function getShopifyVariantStatsNonBlocking(): {
  ready: boolean
  skuCount: number
  rawVariantCount: number
} {
  if (!cache) {
    return { ready: false, skuCount: 0, rawVariantCount: 0 }
  }

  return {
    ready: true,
    skuCount: cache.skuSet.size,
    rawVariantCount: cache.rawVariantCount,
  }
}
