import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getShopifyVariantSkuSet } from "@/lib/shopify-variant-skus"
import { getFilteredInternalStock } from "@/lib/unleashed-stock"

export const maxDuration = 60

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.UNLEASHED_API_ID || !process.env.UNLEASHED_API_KEY) {
    return NextResponse.json(
      { error: "Unleashed API credentials not configured" },
      { status: 500 }
    )
  }

  try {
    const shopifySkuSet = await getShopifyVariantSkuSet()
    const { items, diagnostics } = await getFilteredInternalStock(shopifySkuSet)
    return NextResponse.json({ items, diagnostics })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Unleashed API request failed", detail },
      { status: 502 }
    )
  }
}
