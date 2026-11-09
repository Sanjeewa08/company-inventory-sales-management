import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? hintId : undefined}
          className={`min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 ${error ? "border-rose-300" : "border-slate-200"} ${className}`}
          {...props}
        />
        {(error || hint) && (
          <p
            id={hintId}
            className={`text-xs ${error ? "text-rose-600" : "text-slate-500"}`}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
