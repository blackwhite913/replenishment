import { createHmac } from "crypto"
import { getCwInventory } from "@/lib/cw-inventory"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 200
const TTL_MS = 300_000 // 5 minutes
const FETCH_TIMEOUT_MS = 55_000

interface UnleashedPagination {
  NumberOfPages?: number
}

interface StockOnHandItem {
  ProductCode?: string
  ProductDescription?: string
  ProductGuid?: string
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

export interface InternalStockItem {
  productCode: string
  productDescription: string
  productGuid: string
  unit3Qty: number
  unit10Qty: number
  internalStockTotal: number
  threePLStock: number | null
}

export interface StockDiagnostics {
  totalUnleashedRows: number
  totalShopifyVariantSkus: number
  matchedRows: number
  unmatchedRows: number
  durationMs: number
  threePlAvailable: boolean
}

const INTERNAL_WAREHOUSE_CODES = new Set(["U3", "U10"])

function getSignature(queryString: string, apiKey: string): string {
  return createHmac("sha256", apiKey).update(queryString, "utf8").digest("base64")
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Unleashed stock request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchStockPage(
  page: number,
  warehouseCode: string,
  apiId: string,
  apiKey: string
): Promise<UnleashedStockOnHandPage> {
  const today = new Date().toISOString().slice(0, 10)
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

  const res = await fetchWithTimeout(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(
      `Unleashed /StockOnHand page ${page} (warehouseCode=${warehouseCode}) failed (${res.status}): ${detail}`
    )
  }
  return (await res.json()) as UnleashedStockOnHandPage
}

async function fetchAllPagesForWarehouse(
  warehouseCode: string,
  apiId: string,
  apiKey: string
): Promise<StockOnHandItem[]> {
  const firstPage = await fetchStockPage(1, warehouseCode, apiId, apiKey)
  const firstPageItems = firstPage.Items ?? firstPage.StockOnHand ?? []
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  const allItems: StockOnHandItem[] = [...firstPageItems]

  if (numberOfPages > 1) {
    const remainingPages = Array.from(
      { length: numberOfPages - 1 },
      (_, i) => i + 2
    )
    const allResponses = await Promise.all(
      remainingPages.map((page) =>
        fetchStockPage(page, warehouseCode, apiId, apiKey)
      )
    )
    for (const pageData of allResponses) {
      allItems.push(...(pageData.Items ?? pageData.StockOnHand ?? []))
    }
  }

  return allItems
}

async function fetchStockPageAllWarehouses(
  page: number,
  apiId: string,
  apiKey: string
): Promise<UnleashedStockOnHandPage> {
  const today = new Date().toISOString().slice(0, 10)
  const queryParams = new URLSearchParams({
    asAtDate: today,
    pageSize: String(PAGE_SIZE),
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

  const res = await fetchWithTimeout(url, { headers, cache: "no-store" })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(
      `Unleashed /StockOnHand page ${page} failed (${res.status}): ${detail}`
    )
  }
  return (await res.json()) as UnleashedStockOnHandPage
}

async function fetchAllPagesAllWarehouses(
  apiId: string,
  apiKey: string
): Promise<StockOnHandItem[]> {
  const firstPage = await fetchStockPageAllWarehouses(1, apiId, apiKey)
  const firstPageItems = firstPage.Items ?? firstPage.StockOnHand ?? []
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  const allItems: StockOnHandItem[] = [...firstPageItems]

  if (numberOfPages > 1) {
    const remainingPages = Array.from(
      { length: numberOfPages - 1 },
      (_, i) => i + 2
    )
    const allResponses = await Promise.all(
      remainingPages.map((page) =>
        fetchStockPageAllWarehouses(page, apiId, apiKey)
      )
    )
    for (const pageData of allResponses) {
      allItems.push(...(pageData.Items ?? pageData.StockOnHand ?? []))
    }
  }

  return allItems
}

function mergeToInternalItems(
  u3Items: StockOnHandItem[],
  u10Items: StockOnHandItem[]
): InternalStockItem[] {
  const mergeMap = new Map<string, InternalStockItem>()

  for (const item of u3Items) {
    const productCode = (item.ProductCode ?? "").trim().toUpperCase()
    if (!productCode) continue
    const existing = mergeMap.get(productCode)
    const qty = Number(item.QtyOnHand) || 0
    if (existing) {
      existing.unit3Qty = qty
    } else {
      mergeMap.set(productCode, {
        productCode,
        productDescription: item.ProductDescription ?? "",
        productGuid: item.ProductGuid ?? "",
        unit3Qty: qty,
        unit10Qty: 0,
        internalStockTotal: 0,
        threePLStock: 0,
      })
    }
  }

  for (const item of u10Items) {
    const productCode = (item.ProductCode ?? "").trim().toUpperCase()
    if (!productCode) continue
    const existing = mergeMap.get(productCode)
    const qty = Number(item.QtyOnHand) || 0
    if (existing) {
      existing.unit10Qty = qty
    } else {
      mergeMap.set(productCode, {
        productCode,
        productDescription: item.ProductDescription ?? "",
        productGuid: item.ProductGuid ?? "",
        unit3Qty: 0,
        unit10Qty: qty,
        internalStockTotal: 0,
        threePLStock: 0,
      })
    }
  }

  return Array.from(mergeMap.values()).map((entry) => ({
    ...entry,
    internalStockTotal: entry.unit3Qty + entry.unit10Qty,
    threePLStock: 0,
  }))
}

// ---------------------------------------------------------------------------
// Server-side cache — raw stock (independent of Shopify SKU set)
// ---------------------------------------------------------------------------

interface RawStockCache {
  mergedItems: InternalStockItem[]
  threePlStockMap: Map<string, number>
  threePlAvailable: boolean
  lastUpdated: number
}

let rawCache: RawStockCache | null = null
let rawRefreshPromise: Promise<RawStockCache> | null = null

async function buildRawStock(
  apiId: string,
  apiKey: string
): Promise<RawStockCache> {
  let u3Items: StockOnHandItem[]
  let u10Items: StockOnHandItem[]
  let cwData: Awaited<ReturnType<typeof getCwInventory>> | null = null

  try {
    const [u3Res, u10Res, cwRes] = await Promise.all([
      fetchAllPagesForWarehouse("U3", apiId, apiKey),
      fetchAllPagesForWarehouse("U10", apiId, apiKey),
      getCwInventory().catch((err) => {
        console.error("[unleashed-stock] CW inventory fetch failed:", err)
        return null
      }),
    ])
    u3Items = u3Res
    u10Items = u10Res
    cwData = cwRes
  } catch {
    const allItems = await fetchAllPagesAllWarehouses(apiId, apiKey)
    const filtered = allItems.filter((i) =>
      INTERNAL_WAREHOUSE_CODES.has(i.WarehouseCode ?? "")
    )
    u3Items = filtered.filter((i) => (i.WarehouseCode ?? "") === "U3")
    u10Items = filtered.filter((i) => (i.WarehouseCode ?? "") === "U10")
  }

  const mergedItems = mergeToInternalItems(u3Items, u10Items)
  const threePlAvailable = !!cwData

  const threePlStockMap = new Map<string, number>()
  if (cwData?.items) {
    for (const row of cwData.items) {
      const code = (row.productCode ?? "").trim().toUpperCase()
      const qty = Number(row.qtyOnHand) || 0
      threePlStockMap.set(code, (threePlStockMap.get(code) ?? 0) + qty)
    }
  }

  for (const item of mergedItems) {
    item.threePLStock = threePlAvailable
      ? (threePlStockMap.get(item.productCode) ?? 0)
      : null
  }

  return { mergedItems, threePlStockMap, threePlAvailable, lastUpdated: Date.now() }
}

async function getRawStock(forceRefresh = false): Promise<RawStockCache> {
  const apiId = process.env.UNLEASHED_API_ID
  const apiKey = process.env.UNLEASHED_API_KEY
  if (!apiId || !apiKey) {
    throw new Error("Unleashed API credentials not configured")
  }

  const now = Date.now()
  if (!forceRefresh && rawCache && now - rawCache.lastUpdated < TTL_MS) {
    return rawCache
  }

  if (rawRefreshPromise && !forceRefresh) {
    return rawRefreshPromise
  }

  if (forceRefresh) rawRefreshPromise = null

  rawRefreshPromise = buildRawStock(apiId, apiKey)
    .then((result) => {
      rawCache = result
      rawRefreshPromise = null
      return result
    })
    .catch((err) => {
      rawRefreshPromise = null
      if (rawCache) {
        console.warn("[unleashed-stock] Refresh failed, serving stale cache:", err)
        return rawCache
      }
      throw err
    })

  return rawRefreshPromise
}

/**
 * Returns internal stock filtered by Shopify SKU set.
 * If shopifySkuSet is empty (not yet loaded), returns ALL stock items unfiltered.
 * Raw stock is cached independently of Shopify state for 5 minutes.
 */
export async function getFilteredInternalStock(
  shopifySkuSet: Set<string>,
  forceRefresh = false
): Promise<{ items: InternalStockItem[]; diagnostics: StockDiagnostics }> {
  const start = Date.now()
  const raw = await getRawStock(forceRefresh)
  const totalUnleashedRows = raw.mergedItems.length
  const totalShopifyVariantSkus = shopifySkuSet.size
  const skipFilter = shopifySkuSet.size === 0

  let resultItems: InternalStockItem[]
  let matchedRows: number

  if (skipFilter) {
    resultItems = raw.mergedItems
    matchedRows = raw.mergedItems.length
  } else {
    const filteredItems = raw.mergedItems.filter((i) =>
      shopifySkuSet.has(i.productCode)
    )
    matchedRows = filteredItems.length
    const existingCodes = new Set(filteredItems.map((i) => i.productCode))

    resultItems = [...filteredItems]
    for (const sku of shopifySkuSet) {
      if (!existingCodes.has(sku)) {
        resultItems.push({
          productCode: sku,
          productDescription: sku,
          productGuid: "",
          unit3Qty: 0,
          unit10Qty: 0,
          internalStockTotal: 0,
          threePLStock: raw.threePlAvailable
            ? (raw.threePlStockMap.get(sku) ?? 0)
            : null,
        })
      }
    }
  }

  return {
    items: resultItems,
    diagnostics: {
      totalUnleashedRows,
      totalShopifyVariantSkus,
      matchedRows,
      unmatchedRows: skipFilter ? 0 : totalShopifyVariantSkus - matchedRows,
      durationMs: Date.now() - start,
      threePlAvailable: raw.threePlAvailable,
    },
  }
}
