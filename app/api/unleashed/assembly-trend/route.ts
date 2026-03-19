import { NextResponse } from "next/server"
import { getAssemblyTrend } from "@/lib/unleashed-assemblies"

export async function GET(request: Request) {
  // #region agent log
  const _routeStart = Date.now();
  fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'assembly-trend/route.ts:GET:start',message:'Assembly-trend route called',timestamp:_routeStart,hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get("refresh") === "1"

  try {
    const result = await getAssemblyTrend(forceRefresh)
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'assembly-trend/route.ts:GET:done',message:'Assembly-trend route done',data:{durationMs:Date.now()-_routeStart,componentCount:Object.keys(result.byComponentSku??{}).length},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      byComponentSku: result.byComponentSku ?? {},
      lastUpdated: result.lastUpdated,
    })
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/55bfa669-1c28-47a7-822a-5e1e23521f36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1840fa'},body:JSON.stringify({sessionId:'1840fa',location:'assembly-trend/route.ts:GET:error',message:'Assembly-trend route error',data:{durationMs:Date.now()-_routeStart,error:String(error)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    const detail = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      {
        error: "Assembly trend fetch failed",
        detail,
      },
      { status: 502 }
    )
  }
}
