"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Error boundary for data tables — catches render errors and shows a retry button. */
export class TableErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-6 text-center">
          <p className="text-red-400 font-semibold mb-2">Render error</p>
          <p className="text-[#a0a0a0] text-xs font-mono">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-3 py-1 rounded text-xs bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
