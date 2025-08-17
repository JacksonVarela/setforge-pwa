import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(error) {
    return { err: error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (!this.state.err) return this.props.children;

    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="max-w-screen-sm mx-auto rounded-2xl border border-red-700 bg-neutral-900 p-4">
          <h1 className="text-lg font-bold text-red-400">App crashed</h1>
          <p className="text-sm text-neutral-300 mt-2">
            Something threw before rendering. The error is shown below — copy it
            to me and I’ll fix it.
          </p>
          <pre className="mt-3 text-xs whitespace-pre-wrap bg-black/60 p-3 rounded-lg overflow-auto">
{String(this.state.err?.stack || this.state.err?.message || this.state.err)}
          </pre>
          <button
            className="mt-3 px-3 py-2 rounded-xl bg-white text-black text-sm"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
