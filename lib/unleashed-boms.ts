import { createHmac } from "crypto"

const UNLEASHED_BASE = "https://api.unleashedsoftware.com"
const PAGE_SIZE = 200
const TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
const FETCH_TIMEOUT_MS = 15_000

interface UnleashedPagination {
  NumberOfPages?: number
}

interface UnleashedBomPage {
  Pagination?: UnleashedPagination
  Items?: Record<string, unknown>[]
}

interface BomCacheResult {
  items: Record<string, unknown>[]
  lastUpdated: number
}

let cache: BomCacheResult | null = null
let refreshPromise: Promise<BomCacheResult> | null = null

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
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchBomPage(
  page: number,
  apiId: string,
  apiKey: string
): Promise<UnleashedBomPage> {
  const queryParams = new URLSearchParams({ pageSize: String(PAGE_SIZE) })
  const queryString = queryParams.toString()
  const signature = getSignature(queryString, apiKey)
  const url = `${UNLEASHED_BASE}/BillOfMaterials/${page}?${queryString}`

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
    throw new Error(`Unleashed /BillOfMaterials page ${page} failed (${res.status}): ${detail}`)
  }
  return (await res.json()) as UnleashedBomPage
}

async function fetchAllBomPages(
  apiId: string,
  apiKey: string
): Promise<BomCacheResult> {
  const firstPage = await fetchBomPage(1, apiId, apiKey)
  const allItems: Record<string, unknown>[] = [...(firstPage.Items ?? [])]
  const numberOfPages = firstPage.Pagination?.NumberOfPages ?? 1

  if (numberOfPages > 1) {
    const remaining = Array.from({ length: numberOfPages - 1 }, (_, i) => i + 2)
    const pages = await Promise.all(
      remaining.map((p) => fetchBomPage(p, apiId, apiKey))
    )
    for (const page of pages) {
      allItems.push(...(page.Items ?? []))
    }
  }

  return { items: allItems, lastUpdated: Date.now() }
}

export async function getAllBoms(
  forceRefresh = false
): Promise<BomCacheResult> {
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

  refreshPromise = fetchAllBomPages(apiId, apiKey)
    .then((result) => {
      cache = result
      refreshPromise = null
      return result
    })
    .catch((err) => {
      refreshPromise = null
      if (cache) {
        console.warn("[unleashed-boms] Refresh failed, serving stale cache:", err)
        return cache
      }
      throw err
    })

  return refreshPromise
}
