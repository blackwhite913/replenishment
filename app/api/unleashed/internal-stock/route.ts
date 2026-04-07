import { createHmac } from "crypto"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getShopifySkuSet } from "@/lib/shopify-skus"
import { getCwInventory } from "@/lib/cw-inventory"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 200
const TTL_MS = 300_000
const FETCH_TIMEOUT_MS = 55_000

export const maxDuration = 60

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

interface InternalStockItem {
  productCode: string
  productDescription: string
  productGuid: string
  unit3Qty: number
  unit10Qty: number
  internalStockTotal: number
  threePLStock: number
}

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
) {
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
) {
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

const INTERNAL_WAREHOUSE_CODES = new Set(["U3", "U10"])

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
    const productCode = item.ProductCode ?? ""
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
    const productCode = item.ProductCode ?? ""
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

let cache: { items: InternalStockItem[]; lastUpdated: number } | null = null
let refreshPromise: Promise<InternalStockItem[]> | null = null

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
    return NextResponse.json({ items: cache.items })
  }
  if (cache && refreshPromise) {
    try {
      const items = await refreshPromise
      return NextResponse.json({ items })
    } catch {
      return NextResponse.json({ items: cache.items })
    }
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        let u3Items: StockOnHandItem[]
        let u10Items: StockOnHandItem[]
        let usedFallback = false

        let cwData: Awaited<ReturnType<typeof getCwInventory>> | null = null
        try {
          const [u3Res, u10Res, cwRes] = await Promise.all([
            fetchAllPagesForWarehouse("U3", apiId, apiKey),
            fetchAllPagesForWarehouse("U10", apiId, apiKey),
            getCwInventory().catch((err) => {
              console.error("[internal-stock] CW inventory fetch failed:", err)
              return null
            }),
          ])
          u3Items = u3Res
          u10Items = u10Res
          cwData = cwRes
        } catch (whErr) {
          usedFallback = true
          const allItems = await fetchAllPagesAllWarehouses(apiId, apiKey)
          const filtered = allItems.filter((i) =>
            INTERNAL_WAREHOUSE_CODES.has(i.WarehouseCode ?? "")
          )
          u3Items = filtered.filter((i) => (i.WarehouseCode ?? "") === "U3")
          u10Items = filtered.filter((i) => (i.WarehouseCode ?? "") === "U10")
        }

        const mergedItems = mergeToInternalItems(u3Items, u10Items)
        const shopifySkuSet = getShopifySkuSet()

        let items: InternalStockItem[]

        if (shopifySkuSet === null) {
          console.error("[internal-stock] Shopify CSV missing, returning unfiltered data")
          items = mergedItems
        } else if (shopifySkuSet.size === 0) {
          items = []
        } else {
          const skuSet = shopifySkuSet
          const filteredItems = mergedItems.filter((i) =>
            skuSet.has(i.productCode)
          )
          const existingProductCodes = new Set(
            filteredItems.map((i) => i.productCode)
          )
          const result = [...filteredItems]
          for (const sku of skuSet) {
            if (!existingProductCodes.has(sku)) {
              result.push({
                productCode: sku,
                productDescription: sku,
                productGuid: "",
                unit3Qty: 0,
                unit10Qty: 0,
                internalStockTotal: 0,
                threePLStock: 0,
              })
            }
          }
          items = result
        }

        const threePlStockMap = new Map<string, number>()
        if (cwData?.items) {
          for (const row of cwData.items) {
            const code = row.productCode ?? ""
            const qty = Number(row.qtyOnHand) || 0
            threePlStockMap.set(code, (threePlStockMap.get(code) ?? 0) + qty)
          }
        }
        items = items.map((item) => ({
          ...item,
          threePLStock: threePlStockMap.get(item.productCode) ?? 0,
        }))

        cache = { items, lastUpdated: Date.now() }
        return items
      } finally {
        refreshPromise = null
      }
    })()
  }

  try {
    const items = await refreshPromise
    return NextResponse.json({ items })
  } catch (error) {
    if (cache) {
      return NextResponse.json({ items: cache.items })
    }
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
