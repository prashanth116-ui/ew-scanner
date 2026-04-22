"use client";

import { Component, type ReactNode } from "react";
import { logError } from "@/lib/error-logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError("ErrorBoundary", error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8">
            <h2 className="mb-2 text-lg font-bold text-red-400">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-[#a0a0a0]">
              The app encountered an unexpected error. Try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6dba]"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
