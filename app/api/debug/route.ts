import { NextResponse } from "next/server"
import { list, put } from "@vercel/blob"

export async function GET() {
  const info = {
    deployVersion: "v2-allowOverwrite",
    hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasBlobStoreId: !!process.env.BLOB_STORE_ID,
    hasOidcToken: !!process.env.VERCEL_OIDC_TOKEN,
    nodeEnv: process.env.NODE_ENV,
  }

  try {
    // 测试 1: 列出 blobs
    const result = await list({ prefix: "projects/", limit: 10 })

    // 测试 2: 测试 allowOverwrite 写入
    let writeTestResult = "skipped"
    try {
      await put("_test/overwrite-test.txt", "test-" + Date.now(), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain",
      })
      // 再写一次同路径，验证 overwrite 是否生效
      await put("_test/overwrite-test.txt", "test-" + Date.now(), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain",
      })
      writeTestResult = "success"
    } catch (writeErr) {
      writeTestResult = writeErr instanceof Error ? writeErr.message : String(writeErr)
    }

    return NextResponse.json({
      ...info,
      blobListSuccess: true,
      blobCount: result.blobs.length,
      writeTestResult,
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
