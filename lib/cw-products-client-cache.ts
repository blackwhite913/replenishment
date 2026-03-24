export interface CwInventoryItem {
  productCode: string
  productDescription: string
  warehouseName: string
  qtyOnHand: number
  allocatedQty: number
  availableQty: number
  avgCost: number
  totalCost: number
}

export interface CwInventoryResponse {
  totalQtyOnHand: number
  skuCount: number
  items: CwInventoryItem[]
}

let sessionCache: CwInventoryResponse | null = null
let inflight: Promise<CwInventoryResponse> | null = null

/**
 * Fetches CW inventory once per browser session; subsequent calls resolve immediately.
 */
export function getCwProductsCached(): Promise<CwInventoryResponse> {
  if (sessionCache) return Promise.resolve(sessionCache)
  if (inflight) return inflight

  inflight = fetch("/api/unleashed/cw-products")
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok) {
        const message =
          body?.error === "warehouse_controls_off"
            ? "Warehouse-level inventory is not enabled in Unleashed. Turn on 'Per Warehouse Controls' or use InventoryDetail endpoint if available."
            : body?.message || "Failed to load CW warehouse inventory."
        throw new Error(message)
      }
      sessionCache = body as CwInventoryResponse
      return sessionCache
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function invalidateCwProductsCache() {
  sessionCache = null
  inflight = null
}
