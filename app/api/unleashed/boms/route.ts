import { NextResponse } from "next/server"
import { getAllBoms } from "@/lib/unleashed-boms"

export async function GET(request: Request) {
  // #region agent log
  const _routeStart = Date.now();
  fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'boms/route.ts:GET:start',message:'BOMs route called',timestamp:_routeStart,hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get("refresh") === "1"

  try {
    const result = await getAllBoms(forceRefresh)
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'boms/route.ts:GET:done',message:'BOMs route done',data:{durationMs:Date.now()-_routeStart,bomCount:result.items.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      Items: result.items,
      allPages: true,
      lastUpdated: result.lastUpdated,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Unleashed BOM fetch failed", detail },
      { status: 502 }
    )
  }
}
