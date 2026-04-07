import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSalesTrend } from "@/lib/unleashed-sales"

export const maxDuration = 60

export async function GET(request: NextRequest) {
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

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1"
  const sku = request.nextUrl.searchParams.get("sku")?.trim() || null

  try {
    const result = await getSalesTrend(forceRefresh)

    if (sku && result.bySku?.[sku]) {
      const skuData = result.bySku[sku]
      return NextResponse.json({
        last90Days: skuData.last90Days,
        total90Days: skuData.total90Days,
        lastUpdated: result.lastUpdated,
      })
    }
    if (sku) {
      return NextResponse.json({
        last90Days: Array.from({ length: 90 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (89 - i))
          return { date: d.toISOString().slice(0, 10), units: 0 }
        }),
        total90Days: 0,
        lastUpdated: result.lastUpdated,
      })
    }

    return NextResponse.json({
      last90Days: result.last90Days,
      total90Days: result.total90Days,
      bySku: result.bySku ?? {},
      lastUpdated: result.lastUpdated,
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
