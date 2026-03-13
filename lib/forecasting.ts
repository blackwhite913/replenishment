export function computeDailySales(total90Days: number): number {
  const raw = total90Days / 90
  return Math.max(1, Math.round(raw))
}

export function computeDaysCover(shopStock: number, dailySales: number): number {
  return Math.floor(shopStock / dailySales)
}

export function computeReorderPoint(dailySales: number, leadTime: number): number {
  return dailySales * leadTime
}

/**
 * Classifies replenishment status by comparing stock (units) to reorder point (units).
 * Reorder point is a quantity threshold: when stock approaches it, reorder.
 * Uses monitoringBufferUnits = dailySales (~1 day of demand) to define the "healthy" band.
 *
 * Units: shopStock (units), reorderPoint (units), dailySales (units/day)
 * Status is units vs units - dimensionally correct.
 */
export function computeStatus(
  shopStock: number,
  reorderPoint: number,
  dailySales: number
): "healthy" | "monitoring" | "oosRisk" {
  const monitoringBuffer = dailySales

  if (shopStock > reorderPoint + monitoringBuffer) return "healthy"
  if (shopStock > reorderPoint) return "monitoring"
  return "oosRisk"
}
