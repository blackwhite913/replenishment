import {
  computeDailySales,
  computeDaysCover,
  computeReorderPoint,
  computeStatus,
} from "@/lib/forecasting"
import type { InternalStockItem } from "@/lib/unleashed-stock"
import type { LightBomLine } from "@/lib/unleashed-bom-light"
import type { AssemblyTrendResult } from "@/lib/unleashed-assemblies"
import type { SkuItem } from "@/lib/placeholder-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DemandType = "SALES_ONLY" | "ASM_ONLY" | "HYBRID" | "NO_DEMAND"

export interface BomDetail {
  parentSku: string
  parentDescription: string
  qtyPerAssembly: number
}

export interface DashboardBundleResult {
  items: SkuItem[]
  bomVisibility: Record<string, BomDetail[]>
}

// ---------------------------------------------------------------------------
// Core builder (stock only — no sales/BOM/assembly needed)
// ---------------------------------------------------------------------------

export function buildCoreItems(
  internalStockItems: InternalStockItem[],
  leadTime: number
): SkuItem[] {
  const items: SkuItem[] = []
  for (const item of internalStockItems) {
    const sku = item.productCode
    const shopStock = item.internalStockTotal
    const dailySales = 1
    const daysCover = computeDaysCover(shopStock, dailySales)
    const reorderPoint = computeReorderPoint(dailySales, leadTime)
    const status = computeStatus(shopStock, reorderPoint, dailySales)

    items.push({
      sku,
      productName: item.productDescription || sku,
      shopStock,
      dailySales,
      daysCover,
      reorderPoint,
      thirdPlStock: item.threePLStock,
      status,
      isComponent: false,
      isUsedInBOM: false,
      salesDemand: 0,
      assemblyDemand: 0,
      totalDemand: 0,
      demandType: "NO_DEMAND",
      bomParents: [],
    })
  }
  return items
}

// ---------------------------------------------------------------------------
// Enrichment merger — takes core items + enrichment data, returns full items
// ---------------------------------------------------------------------------

export interface EnrichmentData {
  salesSummaryBySku: Record<string, { total90Days: number; dailyAverage: number }>
  assemblyTrend: AssemblyTrendResult
  bomLines: LightBomLine[]
  leadTime: number
}

export function enrichItems(
  coreItems: SkuItem[],
  enrichment: EnrichmentData
): DashboardBundleResult {
  const { salesSummaryBySku, assemblyTrend, bomLines, leadTime } = enrichment
  const { parentSkus, componentToParents, componentDescriptions, componentFallbackStock } =
    buildBomMaps(bomLines)
  const bomVisibility = buildBomVisibility(bomLines)

  const stockMap = new Map<string, SkuItem>()
  for (const item of coreItems) {
    stockMap.set(item.sku, item)
  }

  const allSkus = new Map<
    string,
    {
      productName: string
      shopStock: number
      thirdPlStock: number | null
      isComponent: boolean
      isUsedInBOM: boolean
      bomParents: string[]
    }
  >()

  for (const item of coreItems) {
    if (parentSkus.has(item.sku)) continue
    const compParents = componentToParents.get(item.sku)
    allSkus.set(item.sku, {
      productName: item.productName,
      shopStock: item.shopStock,
      thirdPlStock: item.thirdPlStock,
      isComponent: !!compParents,
      isUsedInBOM: !!compParents,
      bomParents: compParents ?? [],
    })
  }

  const threePlUnavailable =
    coreItems.length > 0 && coreItems.every((item) => item.thirdPlStock === null)

  for (const [componentSku, parents] of componentToParents) {
    if (allSkus.has(componentSku)) continue
    if (parentSkus.has(componentSku)) continue
    const existing = stockMap.get(componentSku)
    allSkus.set(componentSku, {
      productName:
        componentDescriptions.get(componentSku) ??
        existing?.productName ??
        componentSku,
      shopStock: existing?.shopStock ?? (componentFallbackStock.get(componentSku) ?? 0),
      thirdPlStock: existing?.thirdPlStock ?? (threePlUnavailable ? null : 0),
      isComponent: true,
      isUsedInBOM: true,
      bomParents: parents,
    })
  }

  const items: SkuItem[] = []
  for (const [sku, info] of allSkus) {
    const salesData = salesSummaryBySku[sku]
    const asmData = assemblyTrend.byComponentSku[sku]
    const salesDemand = salesData?.total90Days ?? 0
    const assemblyDemand = asmData?.total90Days ?? 0
    const totalDemand = salesDemand + assemblyDemand
    const demandType = deriveDemandType(salesDemand, assemblyDemand)
    const dailySales = computeDailySales(totalDemand)
    const daysCover = computeDaysCover(info.shopStock, dailySales)
    const reorderPoint = computeReorderPoint(dailySales, leadTime)
    const status = computeStatus(info.shopStock, reorderPoint, dailySales)

    items.push({
      sku,
      productName: info.productName,
      shopStock: info.shopStock,
      dailySales,
      daysCover,
      reorderPoint,
      thirdPlStock: info.thirdPlStock,
      status,
      isComponent: info.isComponent,
      isUsedInBOM: info.isUsedInBOM,
      salesDemand,
      assemblyDemand,
      totalDemand,
      demandType,
      bomParents: info.bomParents,
    })
  }

  return { items, bomVisibility }
}

// ---------------------------------------------------------------------------
// BOM classification helpers
// ---------------------------------------------------------------------------

interface BomParentMap {
  /** SKUs that are BOM parents (assembled products) */
  parentSkus: Set<string>
  /** Map from component SKU → parent SKUs */
  componentToParents: Map<string, string[]>
  /** Map from component SKU → product description */
  componentDescriptions: Map<string, string>
  /** Map from component SKU → fallback qty on hand */
  componentFallbackStock: Map<string, number>
}

function buildBomMaps(bomLines: LightBomLine[]): BomParentMap {
  const parentSkus = new Set<string>()
  const componentToParents = new Map<string, string[]>()
  const componentDescriptions = new Map<string, string>()
  const componentFallbackStock = new Map<string, number>()

  for (const line of bomLines) {
    parentSkus.add(line.parentSku)

    const existing = componentToParents.get(line.componentSku)
    if (existing) {
      if (!existing.includes(line.parentSku)) {
        existing.push(line.parentSku)
      }
    } else {
      componentToParents.set(line.componentSku, [line.parentSku])
    }

    if (!componentDescriptions.has(line.componentSku) && line.componentDescription) {
      componentDescriptions.set(line.componentSku, line.componentDescription)
    }

    const existing2 = componentFallbackStock.get(line.componentSku) ?? 0
    componentFallbackStock.set(
      line.componentSku,
      Math.max(existing2, line.componentQtyOnHand)
    )
  }

  return { parentSkus, componentToParents, componentDescriptions, componentFallbackStock }
}

function buildBomVisibility(
  bomLines: LightBomLine[]
): Record<string, BomDetail[]> {
  const map = new Map<string, BomDetail[]>()

  for (const line of bomLines) {
    const existing = map.get(line.componentSku)
    const detail: BomDetail = {
      parentSku: line.parentSku,
      parentDescription: line.parentDescription,
      qtyPerAssembly: line.componentQty,
    }

    if (existing) {
      if (!existing.some((d) => d.parentSku === line.parentSku)) {
        existing.push(detail)
      }
    } else {
      map.set(line.componentSku, [detail])
    }
  }

  return Object.fromEntries(map.entries())
}

// ---------------------------------------------------------------------------
// Demand helpers
// ---------------------------------------------------------------------------

function deriveDemandType(ss: number, asm: number): DemandType {
  if (ss > 0 && asm > 0) return "HYBRID"
  if (ss > 0) return "SALES_ONLY"
  if (asm > 0) return "ASM_ONLY"
  return "NO_DEMAND"
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export interface BuildDashboardParams {
  internalStockItems: InternalStockItem[]
  salesSummaryBySku: Record<string, { total90Days: number; dailyAverage: number }>
  assemblyTrend: AssemblyTrendResult
  bomLines: LightBomLine[]
  leadTime: number
}

export function buildDashboard({
  internalStockItems,
  salesSummaryBySku,
  assemblyTrend,
  bomLines,
  leadTime,
}: BuildDashboardParams): DashboardBundleResult {
  const { parentSkus, componentToParents, componentDescriptions, componentFallbackStock } =
    buildBomMaps(bomLines)

  const bomVisibility = buildBomVisibility(bomLines)

  // Build stock lookup map (already normalized to UPPER CASE from unleashed-stock.ts)
  const stockMap = new Map<string, InternalStockItem>()
  for (const item of internalStockItems) {
    if (item.productCode) stockMap.set(item.productCode, item)
  }

  // Collect all active SKUs:
  //   - all stock items that are NOT BOM parents
  //   - all BOM components (may or may not have stock)
  const allSkus = new Map<
    string,
    {
      productName: string
      shopStock: number
      thirdPlStock: number | null
      isComponent: boolean
      isUsedInBOM: boolean
      bomParents: string[]
    }
  >()

  // 1. Internal stock items (exclude BOM parents — they are assembled, not sold directly)
  for (const item of internalStockItems) {
    const sku = item.productCode
    if (parentSkus.has(sku)) continue

    const compParents = componentToParents.get(sku)
    allSkus.set(sku, {
      productName: item.productDescription || sku,
      shopStock: item.internalStockTotal,
      thirdPlStock: item.threePLStock,
      isComponent: !!compParents,
      isUsedInBOM: !!compParents,
      bomParents: compParents ?? [],
    })
  }

  const threePlUnavailable =
    internalStockItems.length > 0 &&
    internalStockItems.every((item) => item.threePLStock === null)

  // 2. BOM components not already added
  for (const [componentSku, parents] of componentToParents) {
    if (allSkus.has(componentSku)) continue
    if (parentSkus.has(componentSku)) continue

    const stockItem = stockMap.get(componentSku)
    allSkus.set(componentSku, {
      productName:
        componentDescriptions.get(componentSku) ||
        stockItem?.productDescription ||
        componentSku,
      shopStock:
        stockItem?.internalStockTotal ??
        (componentFallbackStock.get(componentSku) ?? 0),
      thirdPlStock: stockItem?.threePLStock ?? (threePlUnavailable ? null : 0),
      isComponent: true,
      isUsedInBOM: true,
      bomParents: parents,
    })
  }

  const items: SkuItem[] = []

  for (const [sku, info] of allSkus) {
    const salesData = salesSummaryBySku[sku]
    const asmData = assemblyTrend.byComponentSku[sku]

    const salesDemand = salesData?.total90Days ?? 0
    const assemblyDemand = asmData?.total90Days ?? 0
    const totalDemand = salesDemand + assemblyDemand
    const demandType = deriveDemandType(salesDemand, assemblyDemand)

    const dailySales = computeDailySales(totalDemand)
    const daysCover = computeDaysCover(info.shopStock, dailySales)
    const reorderPoint = computeReorderPoint(dailySales, leadTime)
    const status = computeStatus(info.shopStock, reorderPoint, dailySales)

    items.push({
      sku,
      productName: info.productName,
      shopStock: info.shopStock,
      dailySales,
      daysCover,
      reorderPoint,
      thirdPlStock: info.thirdPlStock,
      status,
      isComponent: info.isComponent,
      isUsedInBOM: info.isUsedInBOM,
      salesDemand,
      assemblyDemand,
      totalDemand,
      demandType,
      bomParents: info.bomParents,
    })
  }

  return { items, bomVisibility }
}
