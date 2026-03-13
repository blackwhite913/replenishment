import { createHmac } from "crypto"

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

export interface CwInventoryRow {
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

export interface CwInventoryResult {
  items: CwInventoryRow[]
  totalQtyOnHand: number
  skuCount: number
  lastUpdated: number
  pagesScanned: number
  durationMs: number
}

let cache: CwInventoryResult | null = null
let cacheLastUpdated = 0
let refreshPromise: Promise<CwInventoryResult> | null = null

function getSignature(queryString: string, apiKey: string): string {
  return createHmac("sha256", apiKey).update(queryString, "utf8").digest("base64")
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
    throw new Error(
      `Unleashed /StockOnHand page ${page} (warehouseCode=${warehouseCode}) failed (${res.status}): ${detail}`
    )
  }
  return (await res.json()) as UnleashedStockOnHandPage
}

async function buildCwInventory(apiId: string, apiKey: string): Promise<CwInventoryResult> {
  const start = Date.now()

  const firstPage = await fetchCwStockPage(1, apiId, apiKey)
  const firstPageItems = firstPage.Items ?? firstPage.StockOnHand ?? []
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  const allItems: StockOnHandItem[] = [...firstPageItems]
  let pagesScanned = 1

  if (numberOfPages > 1) {
    const remainingPages = Array.from(
      { length: numberOfPages - 1 },
      (_, i) => i + 2
    )
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
    `[cw-inventory] durationMs=${durationMs} pagesFetched=${pagesScanned} sohItems=${allItems.length} cwRowsWithStock=${rows.length} totalQtyOnHand=${totalQtyOnHand}`
  )

  return {
    items: rows,
    totalQtyOnHand,
    skuCount: rows.length,
    lastUpdated: Date.now(),
    pagesScanned,
    durationMs,
  }
}

/**
 * Returns CW (3PL) warehouse inventory. Cached for 5 minutes.
 * Shared by cw-products API and internal-stock API.
 */
export async function getCwInventory(): Promise<CwInventoryResult> {
  const apiId = process.env.UNLEASHED_API_ID
  const apiKey = process.env.UNLEASHED_API_KEY
  if (!apiId || !apiKey) {
    throw new Error("Unleashed API credentials not configured")
  }

  const now = Date.now()
  if (cache && now - cacheLastUpdated < TTL_MS) {
    return cache
  }

  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = buildCwInventory(apiId, apiKey).then((result) => {
    cache = result
    cacheLastUpdated = result.lastUpdated
    refreshPromise = null
    return result
  })

  return refreshPromise
}
