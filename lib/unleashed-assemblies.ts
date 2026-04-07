import { createHmac } from "crypto"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 1000
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const DAYS_RANGE = 90
const FETCH_TIMEOUT_MS = 15_000

interface UnleashedPagination {
  NumberOfPages?: number
}

interface UnleashedProduct {
  ProductCode?: string
}

interface UnleashedAssemblyLine {
  Product?: UnleashedProduct
  Quantity?: number
}

interface UnleashedAssembly {
  AssemblyNumber?: string
  AssemblyDate?: string
  AssemblyStatus?: string
  Quantity?: number
  AssemblyLines?: UnleashedAssemblyLine[]
}

interface UnleashedAssembliesPage {
  Pagination?: UnleashedPagination
  Items?: UnleashedAssembly[]
}

export interface DemandDayPoint {
  date: string
  units: number
}

export interface AssemblyTrendResult {
  byComponentSku: Record<
    string,
    { last90Days: DemandDayPoint[]; total90Days: number }
  >
  lastUpdated: number
}

let cache: AssemblyTrendResult | null = null
let refreshPromise: Promise<AssemblyTrendResult> | null = null
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

function parseApiDate(str: string | undefined): string | null {
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

function build90DayBuckets(
  startDate: string,
  dailyTotals: Map<string, number>
): DemandDayPoint[] {
  const result: DemandDayPoint[] = []
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

async function fetchAssembliesPage(
  page: number,
  startDate: string,
  endDate: string,
  apiId: string,
  apiKey: string
): Promise<UnleashedAssembliesPage> {
  const queryParams = new URLSearchParams({
    startDate,
    endDate,
    pageSize: String(PAGE_SIZE),
    assemblyStatus: "Completed",
  })
  const queryString = queryParams.toString()
  const signature = getSignature(queryString, apiKey)
  const url = `${UNLEASHED_BASE}/Assemblies/${page}?${queryString}`

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
      `Unleashed /Assemblies page ${page} failed (${res.status}): ${detail}`
    )
  }
  return (await res.json()) as UnleashedAssembliesPage
}

async function fetchAssembliesPageWithRetry(
  page: number,
  startDate: string,
  endDate: string,
  apiId: string,
  apiKey: string
): Promise<UnleashedAssembliesPage> {
  try {
    return await fetchAssembliesPage(page, startDate, endDate, apiId, apiKey)
  } catch {
    return fetchAssembliesPage(page, startDate, endDate, apiId, apiKey)
  }
}

function aggregateAssemblies(
  assemblies: UnleashedAssembly[],
  startDate: string,
  endDate: string
): AssemblyTrendResult["byComponentSku"] {
  const bySkuDaily = new Map<string, Map<string, number>>()

  for (const assembly of assemblies) {
    const assemblyDate = parseApiDate(assembly.AssemblyDate)
    if (!assemblyDate) continue
    if (assemblyDate < startDate || assemblyDate > endDate) continue
    if (
      assembly.AssemblyStatus &&
      assembly.AssemblyStatus.toLowerCase() !== "completed"
    ) {
      continue
    }

    const assemblyQty = Math.abs(Number(assembly.Quantity) || 0)
    if (assemblyQty <= 0) continue

    for (const line of assembly.AssemblyLines ?? []) {
      const componentSku = line.Product?.ProductCode?.trim()
      if (!componentSku) continue

      const lineQty = Math.abs(Number(line.Quantity) || 0)
      if (lineQty <= 0) continue

      // AssemblyLine.Quantity in Unleashed is already the TOTAL consumed for this
      // assembly run, not a per-unit BOM quantity. Do NOT multiply by assemblyQty.
      const consumedUnits = lineQty

      let skuMap = bySkuDaily.get(componentSku)
      if (!skuMap) {
        skuMap = new Map()
        bySkuDaily.set(componentSku, skuMap)
      }
      skuMap.set(assemblyDate, (skuMap.get(assemblyDate) ?? 0) + consumedUnits)
    }
  }

  const byComponentSku: AssemblyTrendResult["byComponentSku"] = {}
  for (const [sku, skuDaily] of bySkuDaily) {
    const last90Days = build90DayBuckets(startDate, skuDaily)
    const total90Days = last90Days.reduce((sum, p) => sum + p.units, 0)
    byComponentSku[sku] = { last90Days, total90Days }
  }
  return byComponentSku
}

async function buildAssemblyTrend(
  apiId: string,
  apiKey: string
): Promise<AssemblyTrendResult> {
  const { startDate, endDate } = getDateRange()

  const firstPage = await fetchAssembliesPageWithRetry(
    1,
    startDate,
    endDate,
    apiId,
    apiKey
  )
  const items: UnleashedAssembly[] = [...(firstPage.Items ?? [])]
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  if (numberOfPages > 1) {
    const remainingPages = Array.from(
      { length: numberOfPages - 1 },
      (_, i) => i + 2
    )
    const allResponses = await Promise.all(
      remainingPages.map((page) =>
        fetchAssembliesPageWithRetry(page, startDate, endDate, apiId, apiKey)
      )
    )
    for (const pageData of allResponses) {
      items.push(...(pageData.Items ?? []))
    }
  }

  const byComponentSku = aggregateAssemblies(items, startDate, endDate)

  return {
    byComponentSku,
    lastUpdated: Date.now(),
  }
}

export async function getAssemblyTrend(
  forceRefresh = false
): Promise<AssemblyTrendResult> {
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

  if (!forceRefresh && cache) {
    if (!backgroundRefreshPromise) {
      backgroundRefreshPromise = buildAssemblyTrend(apiId, apiKey)
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

  refreshPromise = buildAssemblyTrend(apiId, apiKey)
    .then((result) => {
      cache = result
      refreshPromise = null
      return result
    })
    .catch((err) => {
      refreshPromise = null
      if (cache) {
        console.warn(
          "[unleashed-assemblies] Refresh failed, serving stale cache:",
          err
        )
        return cache
      }
      throw err
    })

  return refreshPromise
}
