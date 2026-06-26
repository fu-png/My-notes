import { FileUpload } from "@/components/file-upload"
import { UploadedFilesList } from "@/components/uploaded-files-list"

export const metadata = {
  title: "上传文档",
}

export default function UploadsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 md:px-8">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">上传文档</h1>
        <p className="text-sm text-muted-foreground">
          上传你的 Markdown 文件，上传后可在侧边栏"我的文档"中查看和阅读。
        </p>
      </div>

      <FileUpload />

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">已上传的文档</h2>
        <UploadedFilesList />
      </div>
    </div>
  )
}
