import React from "react";

export default function SpinnerButton({ loading, children, className="", disabled, ...props }) {
  return (
    <button
      disabled={loading || disabled}
      className={(loading ? "opacity-70 pointer-events-none " : "") + className}
      {...props}
    >
      {loading ? <span className="spinner mr-2" aria-hidden /> : null}
      {children}
    </button>
  );
}
