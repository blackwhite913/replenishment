import { getAllBoms } from "@/lib/unleashed-boms"

export interface LightBomLine {
  parentSku: string
  parentDescription: string
  componentSku: string
  componentDescription: string
  componentQty: number
  componentQtyOnHand: number
}

/**
 * Returns a stripped, flat list of BOM lines.
 * Only the 6 fields needed by the dashboard are included.
 * SKUs are normalized to UPPER CASE for consistent matching.
 * Reuses the getAllBoms() 6-hour server cache internally.
 */
export async function getLightBoms(
  forceRefresh = false
): Promise<LightBomLine[]> {
  const { items } = await getAllBoms(forceRefresh)

  const lines: LightBomLine[] = []

  for (const bom of items) {
    const raw = bom as Record<string, unknown>

    const productRaw = raw.Product as Record<string, unknown> | undefined
    if (!productRaw) continue

    const parentSku = ((productRaw.ProductCode as string | undefined) ?? "")
      .trim()
      .toUpperCase()
    if (!parentSku) continue

    const parentDescription = (
      (productRaw.ProductDescription as string | undefined) ?? ""
    ).trim()

    const bomLines = (raw.BillOfMaterialsLines as unknown[] | undefined) ?? []

    for (const line of bomLines) {
      const lineRaw = line as Record<string, unknown>
      const componentProduct = lineRaw.Product as
        | Record<string, unknown>
        | undefined
      if (!componentProduct) continue

      const componentSku = (
        (componentProduct.ProductCode as string | undefined) ?? ""
      )
        .trim()
        .toUpperCase()
      if (!componentSku) continue

      const componentDescription = (
        (componentProduct.ProductDescription as string | undefined) ?? ""
      ).trim()

      const inventoryDetails = componentProduct.InventoryDetails as
        | Record<string, unknown>
        | undefined

      const componentQty = Number(lineRaw.Quantity) || 0
      const componentQtyOnHand =
        Number(inventoryDetails?.QuantityOnHand) || 0

      lines.push({
        parentSku,
        parentDescription,
        componentSku,
        componentDescription,
        componentQty,
        componentQtyOnHand,
      })
    }
  }

  return lines
}
