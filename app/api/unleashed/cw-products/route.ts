import { createHmac } from "crypto"
import { NextResponse } from "next/server"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 200
const TTL_MS = 300_000
const CW_WAREHOUSE_CODE = "CWL_001"

interface UnleashedPagination {
  NumberOfPages?: number
}

interface StockOnHandItem {
  ProductCode?: string
  ProductDescription?: string
  Warehouse?: string
  WarehouseCode?: string
  WarehouseId?: string
  QtyOnHand?: number
  AllocatedQty?: number
  AvailableQty?: number
  AvgCost?: number
  TotalCost?: number
}

interface UnleashedStockOnHandPage {
  Pagination?: UnleashedPagination
  Items?: StockOnHandItem[]
  StockOnHand?: StockOnHandItem[]
}

interface CwInventoryRow {
  productCode: string
  productDescription: string
  warehouseName: string
  warehouseCode: string
  qtyOnHand: number
  allocatedQty: number
  availableQty: number
  avgCost: number
  totalCost: number
}

interface CacheEntry {
  items: CwInventoryRow[]
  totalQtyOnHand: number
  skuCount: number
  lastUpdated: number
  isRefreshing: boolean
  pagesScanned: number
  durationMs: number
}

interface BuildResult {
  entry: CacheEntry
}

let cache: CacheEntry | null = null
let refreshPromise: Promise<BuildResult> | null = null

function getSignature(queryString: string, apiKey: string): string {
  return createHmac("sha256", apiKey).update(queryString, "utf8").digest("base64")
}

function toResponse(entry: CacheEntry, cached: boolean) {
  return NextResponse.json({
    totalQtyOnHand: entry.totalQtyOnHand,
    skuCount: entry.skuCount,
    items: entry.items,
    lastUpdated: entry.lastUpdated,
    cached,
    durationMs: entry.durationMs,
    pagesScanned: entry.pagesScanned,
  })
}

async function fetchCwStockPage(page: number, apiId: string, apiKey: string) {
  const today = new Date().toISOString().slice(0, 10)
  const warehouseCode = process.env.CW_WAREHOUSE_CODE || CW_WAREHOUSE_CODE
  const queryParams = new URLSearchParams({
    asAtDate: today,
    pageSize: String(PAGE_SIZE),
    warehouseCode,
  })
  const queryString = queryParams.toString()
  const signature = getSignature(queryString, apiKey)
  const url = `${UNLEASHED_BASE}/StockOnHand/${page}?${queryString}`

  const headers: Record<string, string> = {
    "api-auth-id": apiId,
    "api-auth-signature": signature,
    Accept: "application/json",
    "Content-Type": "application/json",
    "client-type": "stockpilot/replenishment",
  }

  const res = await fetch(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Unleashed /StockOnHand page ${page} (warehouseCode=${warehouseCode}) failed (${res.status}): ${detail}`)
  }
  return (await res.json()) as UnleashedStockOnHandPage
}

async function buildCwInventory(apiId: string, apiKey: string): Promise<BuildResult> {
  const start = Date.now()

  const firstPage = await fetchCwStockPage(1, apiId, apiKey)
  const firstPageItems = firstPage.Items ?? firstPage.StockOnHand ?? []
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  const allItems: StockOnHandItem[] = [...firstPageItems]
  let pagesScanned = 1

  if (numberOfPages > 1) {
    const remainingPages = Array.from({ length: numberOfPages - 1 }, (_, i) => i + 2)
    const allResponses = await Promise.all(
      remainingPages.map((page) => fetchCwStockPage(page, apiId, apiKey))
    )
    for (const pageData of allResponses) {
      allItems.push(...(pageData.Items ?? pageData.StockOnHand ?? []))
    }
    pagesScanned += remainingPages.length
  }

  const rows: CwInventoryRow[] = allItems
    .filter((item) => (Number(item.QtyOnHand) || 0) > 0)
    .map((item) => ({
      productCode: item.ProductCode ?? "",
      productDescription: item.ProductDescription ?? "",
      warehouseName: item.Warehouse ?? "",
      warehouseCode: item.WarehouseCode ?? "",
      qtyOnHand: Number(item.QtyOnHand) || 0,
      allocatedQty: Number(item.AllocatedQty) || 0,
      availableQty: Number(item.AvailableQty) || 0,
      avgCost: Number(item.AvgCost) || 0,
      totalCost: Number(item.TotalCost) || 0,
    }))

  const totalQtyOnHand = rows.reduce((sum, row) => sum + row.qtyOnHand, 0)
  const durationMs = Date.now() - start

  console.log(
    `[cw-products] durationMs=${durationMs} pagesFetched=${pagesScanned} sohItems=${allItems.length} cwRowsWithStock=${rows.length} totalQtyOnHand=${totalQtyOnHand}`
  )

  return {
    entry: {
      items: rows,
      totalQtyOnHand,
      skuCount: rows.length,
      lastUpdated: Date.now(),
      isRefreshing: false,
      pagesScanned,
      durationMs,
    },
  }
}

async function refreshCache(options: { background?: boolean } = {}) {
  const apiId = process.env.UNLEASHED_API_ID
  const apiKey = process.env.UNLEASHED_API_KEY
  if (!apiId || !apiKey) {
    throw new Error("Unleashed API credentials not configured")
  }

  if (!refreshPromise) {
    if (cache) cache.isRefreshing = true

    refreshPromise = buildCwInventory(apiId, apiKey)
      .then((result) => {
        cache = { ...result.entry, isRefreshing: false }
        return result
      })
      .finally(() => {
        if (cache) cache.isRefreshing = false
        refreshPromise = null
      })
  }

  if (options.background) {
    return
  }

  return refreshPromise
}

export async function GET() {
  const apiId = process.env.UNLEASHED_API_ID
  const apiKey = process.env.UNLEASHED_API_KEY
  if (!apiId || !apiKey) {
    return NextResponse.json(
      { error: "Unleashed API credentials not configured" },
      { status: 500 }
    )
  }

  const now = Date.now()

  if (cache && now - cache.lastUpdated < TTL_MS) {
    return toResponse(cache, true)
  }

  if (cache && cache.isRefreshing) {
    return toResponse(cache, true)
  }

  if (cache && !cache.isRefreshing) {
    void refreshCache({ background: true })
    return toResponse(cache, true)
  }

  try {
    const result = await refreshCache({ background: false })
    if (!result) {
      return NextResponse.json(
        {
          error: "Unleashed API request failed",
          detail: "Refresh did not populate cache",
        },
        { status: 502 }
      )
    }

    return toResponse(result.entry, false)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      {
        error: "Unleashed API request failed",
        detail,
      },
      { status: 502 }
    )
  }
}
