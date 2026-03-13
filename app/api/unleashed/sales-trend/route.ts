import { NextRequest, NextResponse } from "next/server"
import { getSalesTrend } from "@/lib/unleashed-sales"

export async function GET(request: NextRequest) {
  // #region agent log
  const routeStart = Date.now()
  fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c7b019'},body:JSON.stringify({sessionId:'c7b019',location:'sales-trend/route.ts',message:'GET request received',timestamp:routeStart,hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c7b019'},body:JSON.stringify({sessionId:'c7b019',location:'sales-trend/route.ts',message:'GET completed',data:{durationMs:Date.now()-routeStart,sku:sku||'overall'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

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
