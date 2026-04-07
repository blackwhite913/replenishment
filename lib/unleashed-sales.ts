import { createHmac } from "crypto"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 1000
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const DAYS_RANGE = 90
const FETCH_TIMEOUT_MS = 55_000

interface UnleashedPagination {
  NumberOfPages?: number
}

interface UnleashedProduct {
  ProductCode?: string
  ProductDescription?: string
}

interface UnleashedInvoiceLine {
  LineType?: string
  Product?: UnleashedProduct
  InvoiceQuantity?: number
}

interface UnleashedInvoice {
  InvoiceDate?: string
  InvoiceLines?: UnleashedInvoiceLine[]
}

interface UnleashedInvoicesPage {
  Pagination?: UnleashedPagination
  Items?: UnleashedInvoice[]
}

export interface SalesDayPoint {
  date: string
  units: number
}

export interface SalesTrendResult {
  last90Days: SalesDayPoint[]
  total90Days: number
  lastUpdated: number
  bySku?: Record<string, { last90Days: SalesDayPoint[]; total90Days: number }>
}

let cache: SalesTrendResult | null = null
let refreshPromise: Promise<SalesTrendResult> | null = null
let backgroundRefreshPromise: Promise<void> | null = null

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

function isServiceSku(code: string): boolean {
  const trimmed = code?.trim() ?? ""
  if (!trimmed) return true
  if (trimmed.startsWith("PAC-PER-")) return true
  if (trimmed === "Shipping" || trimmed === "Rounding") return true
  return false
}

function parseInvoiceDate(str: string | undefined): string | null {
  if (!str) return null
  const match = str.match(/\/Date\((\d+)\)\//)
  if (!match) return null
  const ms = parseInt(match[1], 10)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

function getDateRange(): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - (DAYS_RANGE - 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

function build90DayBuckets(startDate: string, dailyTotals: Map<string, number>): SalesDayPoint[] {
  const result: SalesDayPoint[] = []
  const current = new Date(startDate + "T00:00:00Z")

  for (let i = 0; i < DAYS_RANGE; i++) {
    const dateStr = current.toISOString().slice(0, 10)
    result.push({
      date: dateStr,
      units: dailyTotals.get(dateStr) ?? 0,
    })
    current.setDate(current.getDate() + 1)
  }

  return result
}

async function fetchInvoicesPage(
  page: number,
  startDate: string,
  endDate: string,
  apiId: string,
  apiKey: string
): Promise<UnleashedInvoicesPage> {
  const queryParams = new URLSearchParams({
    startDate,
    endDate,
    pageSize: String(PAGE_SIZE),
  })
  const queryString = queryParams.toString()
  const signature = getSignature(queryString, apiKey)
  const url = `${UNLEASHED_BASE}/Invoices/${page}?${queryString}`

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
    throw new Error(`Unleashed /Invoices page ${page} failed (${res.status}): ${detail}`)
  }
  return (await res.json()) as UnleashedInvoicesPage
}

async function fetchInvoicesPageWithRetry(
  page: number,
  startDate: string,
  endDate: string,
  apiId: string,
  apiKey: string
): Promise<UnleashedInvoicesPage> {
  try {
    return await fetchInvoicesPage(page, startDate, endDate, apiId, apiKey)
  } catch (err) {
    return fetchInvoicesPage(page, startDate, endDate, apiId, apiKey)
  }
}

function aggregateInvoices(
  invoices: UnleashedInvoice[],
  startDate: string,
  endDate: string
): { last90Days: SalesDayPoint[]; total90Days: number; bySku: Record<string, { last90Days: SalesDayPoint[]; total90Days: number }> } {
  const dailyTotals = new Map<string, number>()
  const bySkuDaily = new Map<string, Map<string, number>>()

  for (const invoice of invoices) {
    const invoiceDate = parseInvoiceDate(invoice.InvoiceDate)
    if (!invoiceDate) continue
    if (invoiceDate < startDate || invoiceDate > endDate) continue

    for (const line of invoice.InvoiceLines ?? []) {
      if (line.LineType === "Charge") continue
      const productCode = line.Product?.ProductCode?.trim()
      if (!productCode || isServiceSku(productCode)) continue

      // Unleashed uses negative quantities for sales/shipments (e.g. -1)
      const qty = Math.abs(Math.round(Number(line.InvoiceQuantity) || 0))
      if (qty <= 0) continue

      dailyTotals.set(invoiceDate, (dailyTotals.get(invoiceDate) ?? 0) + qty)

      let skuMap = bySkuDaily.get(productCode)
      if (!skuMap) {
        skuMap = new Map()
        bySkuDaily.set(productCode, skuMap)
      }
      skuMap.set(invoiceDate, (skuMap.get(invoiceDate) ?? 0) + qty)
    }
  }

  const last90Days = build90DayBuckets(startDate, dailyTotals)
  const total90Days = last90Days.reduce((sum, p) => sum + p.units, 0)

  const bySku: Record<string, { last90Days: SalesDayPoint[]; total90Days: number }> = {}
  for (const [sku, skuDaily] of bySkuDaily) {
    const skuLast90 = build90DayBuckets(startDate, skuDaily)
    bySku[sku] = {
      last90Days: skuLast90,
      total90Days: skuLast90.reduce((s, p) => s + p.units, 0),
    }
  }

  return { last90Days, total90Days, bySku }
}

async function buildSalesTrend(apiId: string, apiKey: string): Promise<SalesTrendResult> {
  const { startDate, endDate } = getDateRange()

  const firstPage = await fetchInvoicesPageWithRetry(1, startDate, endDate, apiId, apiKey)
  const items: UnleashedInvoice[] = [...(firstPage.Items ?? [])]
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  if (numberOfPages > 1) {
    const remainingPages = Array.from({ length: numberOfPages - 1 }, (_, i) => i + 2)
    const allResponses = await Promise.all(
      remainingPages.map((page) =>
        fetchInvoicesPageWithRetry(page, startDate, endDate, apiId, apiKey)
      )
    )
    for (const pageData of allResponses) {
      items.push(...(pageData.Items ?? []))
    }
  }

  const { last90Days, total90Days, bySku } = aggregateInvoices(items, startDate, endDate)
  return {
    last90Days,
    total90Days,
    bySku,
    lastUpdated: Date.now(),
  }
}

/**
 * Returns 90-day sales trend aggregated from Unleashed invoices.
 * Cached for 6 hours. Uses refreshPromise to prevent duplicate fetches.
 */
export async function getSalesTrend(forceRefresh = false): Promise<SalesTrendResult> {
  const apiId = process.env.UNLEASHED_API_ID
  const apiKey = process.env.UNLEASHED_API_KEY
  if (!apiId || !apiKey) {
    throw new Error("Unleashed API credentials not configured")
  }

  const now = Date.now()
  if (!forceRefresh && cache && now - cache.lastUpdated < TTL_MS) {
    return cache
  }

  if (refreshPromise && !forceRefresh) {
    return refreshPromise
  }

  if (forceRefresh) {
    refreshPromise = null
  }

  // Stale-while-revalidate: return stale cache immediately while refreshing in background
  if (!forceRefresh && cache) {
    if (!backgroundRefreshPromise) {
      backgroundRefreshPromise = buildSalesTrend(apiId, apiKey)
        .then((result) => {
          cache = result
        })
        .catch(() => {})
        .finally(() => {
          backgroundRefreshPromise = null
        })
    }
    return cache
  }

  refreshPromise = buildSalesTrend(apiId, apiKey)
    .then((result) => {
      cache = result
      refreshPromise = null
      return result
    })
    .catch((err) => {
      refreshPromise = null
      if (cache) {
        console.warn("[unleashed-sales] Refresh failed, serving stale cache:", err)
        return cache
      }
      throw err
    })

  return refreshPromise
}
