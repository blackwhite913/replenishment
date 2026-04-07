import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getCwInventory } from "@/lib/cw-inventory"

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

  try {
    const result = await getCwInventory()
    return NextResponse.json({
      totalQtyOnHand: result.totalQtyOnHand,
      skuCount: result.skuCount,
      items: result.items,
      lastUpdated: result.lastUpdated,
      cached: true,
      durationMs: result.durationMs,
      pagesScanned: result.pagesScanned,
    })
  } catch (error) {
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
