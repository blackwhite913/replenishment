import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getShopifyVariantSkuSetNonBlocking,
  getShopifyVariantSkuSet,
  getShopifyVariantStatsNonBlocking,
} from "@/lib/shopify-variant-skus"
import { getFilteredInternalStock } from "@/lib/unleashed-stock"
import { buildCoreItems } from "@/lib/build-dashboard"

export const maxDuration = 60

interface CoreCache {
  leadTime: number
  payload: string
  lastUpdated: number
  shopifyReady: boolean
}

const CORE_TTL_MS = 300_000
let coreCache: CoreCache | null = null
let coreRefreshPromise: Promise<string> | null = null

async function buildCorePayload(
  leadTime: number,
  forceRefresh: boolean
): Promise<string> {
  const start = Date.now()

  let shopifySkuSet = getShopifyVariantSkuSetNonBlocking()
  let shopifyReady = shopifySkuSet.size > 0

  if (!shopifyReady) {
    try {
      shopifySkuSet = await getShopifyVariantSkuSet(forceRefresh)
      shopifyReady = shopifySkuSet.size > 0
    } catch (err) {
      console.warn("[dashboard-core] Shopify SKU preload failed, using fallback stock universe:", err)
    }
  }

  const shopifyStats = getShopifyVariantStatsNonBlocking()

  console.error(`[dashboard-core] shopifyReady=${shopifyReady} skus=${shopifySkuSet.size} forceRefresh=${forceRefresh}`)

  const stockResult = await getFilteredInternalStock(shopifySkuSet, forceRefresh)
  const items = buildCoreItems(stockResult.items, leadTime)

  const durationMs = Date.now() - start
  console.error(`[dashboard-core] done durationMs=${durationMs} items=${items.length} shopifyReady=${shopifyReady}`)

  return JSON.stringify({
    items,
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs,
      stockRows: stockResult.items.length,
      matchedRows: stockResult.diagnostics.matchedRows,
      unmatchedRows: stockResult.diagnostics.unmatchedRows,
      shopifyVariantSkus: stockResult.diagnostics.totalShopifyVariantSkus,
      shopifyRawVariants: shopifyStats.rawVariantCount,
      shopifyReady,
      threePlAvailable: stockResult.diagnostics.threePlAvailable,
      cached: false,
      enriched: false,
      leadTime,
    },
  })
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.UNLEASHED_API_ID || !process.env.UNLEASHED_API_KEY) {
    return NextResponse.json(
      { error: "Unleashed API credentials not configured" },
      { status: 500 }
    )
  }

  const { searchParams } = request.nextUrl
  const forceRefresh = searchParams.get("refresh") === "1"
  const leadTime = Math.max(
    1,
    Math.min(90, parseInt(searchParams.get("leadTime") ?? "3", 10) || 3)
  )

  const now = Date.now()

  const shopifyNowReady = getShopifyVariantSkuSetNonBlocking().size > 0

  if (
    !forceRefresh &&
    coreCache &&
    coreCache.leadTime === leadTime &&
    now - coreCache.lastUpdated < CORE_TTL_MS &&
    (coreCache.shopifyReady || !shopifyNowReady)
  ) {
    const parsed = JSON.parse(coreCache.payload) as { meta: Record<string, unknown> }
    parsed.meta.cached = true
    return NextResponse.json(parsed)
  }

  if (coreRefreshPromise && !forceRefresh) {
    try {
      const payload = await coreRefreshPromise
      const parsed = JSON.parse(payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    } catch {
      // fall through
    }
  }

  if (forceRefresh) {
    coreCache = null
    coreRefreshPromise = null
  }

  coreRefreshPromise = buildCorePayload(leadTime, forceRefresh)
    .then((payload) => {
      const parsed = JSON.parse(payload) as { meta: { shopifyReady: boolean } }
      coreCache = { leadTime, payload, lastUpdated: Date.now(), shopifyReady: parsed.meta.shopifyReady }
      coreRefreshPromise = null
      return payload
    })
    .catch((err) => {
      coreRefreshPromise = null
      throw err
    })

  try {
    const payload = await coreRefreshPromise
    return NextResponse.json(JSON.parse(payload))
  } catch (error) {
    if (coreCache) {
      const parsed = JSON.parse(coreCache.payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    }
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Dashboard core build failed", detail },
      { status: 502 }
    )
  }
}
