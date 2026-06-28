import { NextResponse } from "next/server"
import { list } from "@vercel/blob"

export async function GET() {
  const info = {
    deployVersion: "v4-retry-on-exists",
    deployTime: "2026-06-28T22:00:00Z",
    hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasBlobStoreId: !!process.env.BLOB_STORE_ID,
    hasOidcToken: !!process.env.VERCEL_OIDC_TOKEN,
    nodeEnv: process.env.NODE_ENV,
  }

  try {
    const result = await list({ prefix: "projects/", limit: 10 })
    return NextResponse.json({
      ...info,
      blobListSuccess: true,
      blobCount: result.blobs.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      ...info,
      blobListSuccess: false,
      error: message,
    }, { status: 500 })
  }
}
