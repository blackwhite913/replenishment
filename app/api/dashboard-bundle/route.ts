import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getShopifyVariantSkuSet } from "@/lib/shopify-variant-skus"
import { getFilteredInternalStock } from "@/lib/unleashed-stock"
import { getSalesSummaryBySku } from "@/lib/unleashed-sales"
import { getAssemblyTrend } from "@/lib/unleashed-assemblies"
import { getLightBoms } from "@/lib/unleashed-bom-light"
import { buildDashboard } from "@/lib/build-dashboard"

export const maxDuration = 60
// Deprecated path: active dashboard uses /api/dashboard-core + /api/dashboard-enrichment.

interface BundleCache {
  leadTime: number
  payload: string
  lastUpdated: number
}

const BUNDLE_TTL_MS = 300_000
let bundleCache: BundleCache | null = null
let bundleRefreshPromise: Promise<string> | null = null

async function buildBundlePayload(
  leadTime: number,
  forceRefresh: boolean
): Promise<string> {
  const start = Date.now()

  const shopifySkuSet = await getShopifyVariantSkuSet(forceRefresh)

  const [stockResult, salesResult, assemblyResult, bomResult] =
    await Promise.allSettled([
      getFilteredInternalStock(shopifySkuSet, forceRefresh),
      getSalesSummaryBySku(forceRefresh),
      getAssemblyTrend(forceRefresh),
      getLightBoms(forceRefresh),
    ])

  if (stockResult.status === "rejected") throw stockResult.reason

  const stockData = stockResult.value
  const salesSummary = salesResult.status === "fulfilled" ? salesResult.value : {}
  const assemblyTrend = assemblyResult.status === "fulfilled"
    ? assemblyResult.value
    : { byComponentSku: {}, lastUpdated: 0 }
  const bomLines = bomResult.status === "fulfilled" ? bomResult.value : []

  const { items, bomVisibility } = buildDashboard({
    internalStockItems: stockData.items,
    salesSummaryBySku: salesSummary,
    assemblyTrend,
    bomLines,
    leadTime,
  })

  return JSON.stringify({
    items,
    bomVisibility,
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      stockRows: stockData.items.length,
      matchedRows: stockData.diagnostics.matchedRows,
      unmatchedRows: stockData.diagnostics.unmatchedRows,
      shopifyVariantSkus: stockData.diagnostics.totalShopifyVariantSkus,
      cached: false,
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

  if (
    !forceRefresh &&
    bundleCache &&
    bundleCache.leadTime === leadTime &&
    now - bundleCache.lastUpdated < BUNDLE_TTL_MS
  ) {
    const parsed = JSON.parse(bundleCache.payload) as { meta: Record<string, unknown> }
    parsed.meta.cached = true
    return NextResponse.json(parsed)
  }

  if (bundleRefreshPromise && !forceRefresh) {
    try {
      const payload = await bundleRefreshPromise
      const parsed = JSON.parse(payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    } catch {
      // fall through
    }
  }

  if (forceRefresh) {
    bundleCache = null
    bundleRefreshPromise = null
  }

  bundleRefreshPromise = buildBundlePayload(leadTime, forceRefresh)
    .then((payload) => {
      bundleCache = { leadTime, payload, lastUpdated: Date.now() }
      bundleRefreshPromise = null
      return payload
    })
    .catch((err) => {
      bundleRefreshPromise = null
      throw err
    })

  try {
    const payload = await bundleRefreshPromise
    return NextResponse.json(JSON.parse(payload))
  } catch (error) {
    if (bundleCache) {
      const parsed = JSON.parse(bundleCache.payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    }
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Dashboard bundle build failed", detail },
      { status: 502 }
    )
  }
}
