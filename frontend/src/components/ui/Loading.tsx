interface LoadingProps {
  label?: string;
  fullScreen?: boolean;
}

export function Loading({
  label = "Loading",
  fullScreen = false,
}: LoadingProps) {
  return (
    <div
      aria-live="polite"
      className={`flex items-center justify-center gap-3 text-sm text-slate-500 ${fullScreen ? "min-h-screen" : "py-12"}`}
      role="status"
    >
      <span className="size-5 animate-spin rounded-full border-2 border-indigo-500 border-r-transparent" />
      <span>{label}</span>
    </div>
  );
}
