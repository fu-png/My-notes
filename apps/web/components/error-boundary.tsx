"use client"

import * as React from "react"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  /** Optional label shown in the error UI to identify which section failed */
  section?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ""}]`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <IconAlertTriangle className="size-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {this.props.section ? `「${this.props.section}」` : "此区域"}加载出错
            </p>
            <p className="text-xs text-muted-foreground">
              {this.state.error?.message || "发生了未知错误"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="gap-1.5"
          >
            <IconRefresh className="size-3.5" />
            重试
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

/** Inline error boundary for smaller sections (e.g., panels) */
export function InlineErrorFallback({
  section,
  onRetry,
}: {
  section?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs text-destructive/80">
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span>{section ? `${section}加载失败` : "加载失败"}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-auto text-xs underline underline-offset-2 hover:text-destructive"
        >
          重试
        </button>
      )}
    </div>
  )
}
