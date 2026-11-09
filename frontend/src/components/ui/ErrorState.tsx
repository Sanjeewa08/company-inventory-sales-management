import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "We couldn’t load this view",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="rounded-2xl border border-rose-100 bg-rose-50 p-6"
      role="alert"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-900">{title}</h2>
          <p className="mt-1 text-sm text-rose-700">{message}</p>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="secondary">
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
