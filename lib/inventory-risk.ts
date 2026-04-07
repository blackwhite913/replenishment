import {
  computeDailySales,
  computeDaysCover,
  computeReorderPoint,
  computeStatus,
} from "@/lib/forecasting"
import { combineTrends, type DemandDayPoint } from "@/lib/bom-demand"
import type { SkuItem } from "@/lib/placeholder-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DemandType = "SALES_ONLY" | "ASM_ONLY" | "HYBRID" | "NO_DEMAND"

export interface BomDetail {
  parentSku: string
  parentName: string
  qtyPerAssembly: number
}

export interface ComponentMeta {
  productName: string
  fallbackStock: number
  parentSkus: string[]
}

export type DemandSource = Record<
  string,
  { total90Days: number; last90Days?: DemandDayPoint[] }
>

export interface InternalStockItem {
  productCode: string
  productDescription: string
  internalStockTotal: number
  threePLStock?: number
}

export interface BOMLine {
  Product?: {
    ProductCode?: string
    ProductDescription?: string
    InventoryDetails?: { QuantityOnHand?: number }
  }
  Quantity?: number
}

export interface BOMItem {
  Product?: { ProductCode?: string; ProductDescription?: string }
  BillOfMaterialsLines?: BOMLine[]
}

export interface BuildUnifiedDatasetParams {
  internalStockItems: InternalStockItem[]
  salesBySku: DemandSource
  assemblyByComponentSku: DemandSource
  bomData: BOMItem[]
  shopifySkuSet: Set<string>
  leadTime: number
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export function classifySkus(
  bomData: BOMItem[],
  shopifySkuSet: Set<string>
) {
  const bomParentSkus = new Set<string>()
  const componentMetaMap = new Map<string, ComponentMeta>()

  const filteredBoms = bomData.filter((bom) => {
    const sku = bom.Product?.ProductCode?.trim()
    return !!sku && shopifySkuSet.has(sku)
  })

  for (const bom of filteredBoms) {
    const parentSku = bom.Product?.ProductCode?.trim()
    if (!parentSku) continue

    bomParentSkus.add(parentSku)

    for (const line of bom.BillOfMaterialsLines ?? []) {
      const sku = line.Product?.ProductCode?.trim()
      if (!sku) continue

      const existing = componentMetaMap.get(sku)
      const productName = line.Product?.ProductDescription?.trim() || sku
      const fallbackStock =
        Number(line.Product?.InventoryDetails?.QuantityOnHand) || 0

      if (existing) {
        existing.productName = existing.productName || productName
        existing.fallbackStock = Math.max(existing.fallbackStock, fallbackStock)
        if (!existing.parentSkus.includes(parentSku)) {
          existing.parentSkus.push(parentSku)
        }
      } else {
        componentMetaMap.set(sku, {
          productName,
          fallbackStock,
          parentSkus: [parentSku],
        })
      }
    }
  }

  return { bomParentSkus, componentMetaMap, filteredBoms }
}

// ---------------------------------------------------------------------------
// BOM Visibility Map (component SKU → parent BOM details)
// ---------------------------------------------------------------------------

export function buildBomVisibilityMap(
  bomData: BOMItem[],
  shopifySkuSet: Set<string>
): Map<string, BomDetail[]> {
  const map = new Map<string, BomDetail[]>()

  for (const bom of bomData) {
    const parentSku = bom.Product?.ProductCode?.trim()
    if (!parentSku || !shopifySkuSet.has(parentSku)) continue

    const parentName =
      bom.Product?.ProductDescription?.trim() || parentSku

    for (const line of bom.BillOfMaterialsLines ?? []) {
      const compSku = line.Product?.ProductCode?.trim()
      if (!compSku) continue

      const detail: BomDetail = {
        parentSku,
        parentName,
        qtyPerAssembly: Number(line.Quantity) || 0,
      }

      const existing = map.get(compSku)
      if (existing) {
        if (!existing.some((d) => d.parentSku === parentSku)) {
          existing.push(detail)
        }
      } else {
        map.set(compSku, [detail])
      }
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Demand type derivation
// ---------------------------------------------------------------------------

function deriveDemandType(ss: number, asm: number): DemandType {
  if (ss > 0 && asm > 0) return "HYBRID"
  if (ss > 0) return "SALES_ONLY"
  if (asm > 0) return "ASM_ONLY"
  return "NO_DEMAND"
}

// ---------------------------------------------------------------------------
// Unified Dataset Builder
// ---------------------------------------------------------------------------

export function buildUnifiedDataset({
  internalStockItems,
  salesBySku,
  assemblyByComponentSku,
  bomData,
  shopifySkuSet,
  leadTime,
}: BuildUnifiedDatasetParams): {
  items: SkuItem[]
  demandTrendBySku: Record<
    string,
    { last90Days: DemandDayPoint[]; total90Days: number }
  >
} {
  const { bomParentSkus, componentMetaMap } = classifySkus(
    bomData,
    shopifySkuSet
  )

  const internalStockMap = new Map<string, InternalStockItem>()
  for (const item of internalStockItems) {
    if (item.productCode) internalStockMap.set(item.productCode, item)
  }

  // Collect all real-stock SKUs: internal stock (minus BOM parents) + BOM components
  const allSkus = new Map<
    string,
    {
      productName: string
      shopStock: number
      thirdPlStock: number
      isComponent: boolean
      isUsedInBOM: boolean
      bomParents: string[]
    }
  >()

  // 1. Add all internal-stock SKUs that are NOT BOM parents
  for (const item of internalStockItems) {
    const sku = item.productCode
    if (bomParentSkus.has(sku)) continue

    const compMeta = componentMetaMap.get(sku)
    allSkus.set(sku, {
      productName: item.productDescription || sku,
      shopStock: item.internalStockTotal,
      thirdPlStock: item.threePLStock ?? 0,
      isComponent: !!compMeta,
      isUsedInBOM: !!compMeta,
      bomParents: compMeta?.parentSkus ?? [],
    })
  }

  // 2. Add BOM components not already in internal-stock
  for (const [sku, meta] of componentMetaMap) {
    if (allSkus.has(sku)) continue
    if (bomParentSkus.has(sku)) continue

    allSkus.set(sku, {
      productName: meta.productName,
      shopStock: meta.fallbackStock,
      thirdPlStock: 0,
      isComponent: true,
      isUsedInBOM: true,
      bomParents: meta.parentSkus,
    })
  }

  const items: SkuItem[] = []
  const demandTrendBySku: Record<
    string,
    { last90Days: DemandDayPoint[]; total90Days: number }
  > = {}

  for (const [sku, info] of allSkus) {
    const ssSource = salesBySku[sku]
    const asmSource = assemblyByComponentSku[sku]

    const salesDemand = Number(ssSource?.total90Days) || 0
    const assemblyDemand = Number(asmSource?.total90Days) || 0
    const totalDemand = salesDemand + assemblyDemand
    const demandType = deriveDemandType(salesDemand, assemblyDemand)

    const ssTrend = ssSource?.last90Days ?? []
    const asmTrend = asmSource?.last90Days ?? []
    const combined = combineTrends(ssTrend, asmTrend)

    demandTrendBySku[sku] = { last90Days: combined, total90Days: totalDemand }

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

  return { items, demandTrendBySku }
}
