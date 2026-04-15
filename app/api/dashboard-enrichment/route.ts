import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSalesSummaryBySku } from "@/lib/unleashed-sales"
import { getAssemblyTrend } from "@/lib/unleashed-assemblies"
import { getLightBoms } from "@/lib/unleashed-bom-light"
import type { AssemblyTrendResult } from "@/lib/unleashed-assemblies"
import type { LightBomLine } from "@/lib/unleashed-bom-light"

export const maxDuration = 60

interface SourceError {
  source: string
  message: string
  recoverable: boolean
}

interface EnrichmentCache {
  payload: string
  lastUpdated: number
  degraded: boolean
}

const ENRICH_TTL_MS = 300_000 // 5 min
const DEGRADED_TTL_MS = 30_000
let enrichCache: EnrichmentCache | null = null
let enrichRefreshPromise: Promise<string> | null = null

async function buildEnrichmentPayload(forceRefresh: boolean): Promise<string> {
  const start = Date.now()

  const [salesResult, assemblyResult, bomResult] = await Promise.allSettled([
    getSalesSummaryBySku(forceRefresh),
    getAssemblyTrend(forceRefresh),
    getLightBoms(forceRefresh),
  ])

  const errors: SourceError[] = []

  let salesBySku: Record<string, { total90Days: number; dailyAverage: number }> = {}
  if (salesResult.status === "fulfilled") {
    salesBySku = salesResult.value
  } else {
    const msg = salesResult.reason instanceof Error ? salesResult.reason.message : String(salesResult.reason)
    console.error(`[dashboard-enrichment] sales failed: ${msg}`)
    errors.push({ source: "sales", message: msg, recoverable: true })
  }

  let assemblyTrend: AssemblyTrendResult = { byComponentSku: {}, lastUpdated: 0 }
  if (assemblyResult.status === "fulfilled") {
    assemblyTrend = assemblyResult.value
  } else {
    const msg = assemblyResult.reason instanceof Error ? assemblyResult.reason.message : String(assemblyResult.reason)
    console.error(`[dashboard-enrichment] assemblies failed: ${msg}`)
    errors.push({ source: "assemblies", message: msg, recoverable: true })
  }

  let bomLite: LightBomLine[] = []
  if (bomResult.status === "fulfilled") {
    bomLite = bomResult.value
  } else {
    const msg = bomResult.reason instanceof Error ? bomResult.reason.message : String(bomResult.reason)
    console.error(`[dashboard-enrichment] boms failed: ${msg}`)
    errors.push({ source: "boms", message: msg, recoverable: true })
  }

  const durationMs = Date.now() - start
  const degraded = errors.length > 0
  console.error(`[dashboard-enrichment] done durationMs=${durationMs} salesSkus=${Object.keys(salesBySku).length} asmSkus=${Object.keys(assemblyTrend.byComponentSku).length} bomLines=${bomLite.length} errors=${errors.length}`)

  return JSON.stringify({
    salesBySku,
    assemblyTrend,
    bomLite,
    errors: errors.length > 0 ? errors : null,
    meta: {
      durationMs,
      salesSkus: Object.keys(salesBySku).length,
      assemblySkus: Object.keys(assemblyTrend.byComponentSku).length,
      bomLines: bomLite.length,
      degraded,
      cached: false,
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

  const now = Date.now()

  const cacheTtl = enrichCache?.degraded ? DEGRADED_TTL_MS : ENRICH_TTL_MS
  if (!forceRefresh && enrichCache && now - enrichCache.lastUpdated < cacheTtl) {
    const parsed = JSON.parse(enrichCache.payload) as { meta: Record<string, unknown> }
    parsed.meta.cached = true
    return NextResponse.json(parsed)
  }

  if (enrichRefreshPromise && !forceRefresh) {
    try {
      const payload = await enrichRefreshPromise
      const parsed = JSON.parse(payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    } catch {
      // fall through
    }
  }

  if (forceRefresh) {
    enrichCache = null
    enrichRefreshPromise = null
  }

  enrichRefreshPromise = buildEnrichmentPayload(forceRefresh)
    .then((payload) => {
      const parsed = JSON.parse(payload) as { errors?: unknown[] | null; meta?: { degraded?: boolean } }
      enrichCache = {
        payload,
        lastUpdated: Date.now(),
        degraded: parsed.meta?.degraded ?? !!(parsed.errors && parsed.errors.length > 0),
      }
      enrichRefreshPromise = null
      return payload
    })
    .catch((err) => {
      enrichRefreshPromise = null
      throw err
    })

  try {
    const payload = await enrichRefreshPromise
    return NextResponse.json(JSON.parse(payload))
  } catch (error) {
    if (enrichCache) {
      const parsed = JSON.parse(enrichCache.payload) as { meta: Record<string, unknown> }
      parsed.meta.cached = true
      return NextResponse.json(parsed)
    }
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Dashboard enrichment build failed", detail },
      { status: 502 }
    )
  }
}
