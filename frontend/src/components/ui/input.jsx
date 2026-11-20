import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_INPUT_CLASS =
  "flex h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const DATE_INPUT_TYPES = new Set(["date", "datetime-local"]);

const setForwardedRef = (forwardedRef, node) => {
  if (typeof forwardedRef === "function") {
    forwardedRef(node);
    return;
  }

  if (forwardedRef) {
    forwardedRef.current = node;
  }
};

const Input = React.forwardRef(
  (
    { className, type, disabled, readOnly, placeholder, "aria-label": ariaLabel, ...props },
    ref
  ) => {
    const inputRef = React.useRef(null);
    const isDateInput = DATE_INPUT_TYPES.has(type);
    const mergedRef = React.useCallback(
      (node) => {
        inputRef.current = node;
        setForwardedRef(ref, node);
      },
      [ref]
    );

    if (!isDateInput) {
      return (
        <input
          type={type}
          className={cn(BASE_INPUT_CLASS, className)}
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          aria-label={ariaLabel}
          {...props}
        />
      );
    }

    const pickerLabel =
      ariaLabel ||
      (type === "datetime-local" ? "Open date and time picker" : "Open date picker");

    const openPicker = () => {
      const input = inputRef.current;

      if (!input || disabled || readOnly) {
        return;
      }

      input.focus();

      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {
          input.click();
        }
        return;
      }

      input.click();
    };

    return (
      <div className="relative w-full">
        <input
          type={type}
          lang="en-GB"
          className={cn(BASE_INPUT_CLASS, "date-picker-input pr-12", className)}
          ref={mergedRef}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={
            placeholder || (type === "datetime-local" ? "DD/MM/YY HH:mm" : "DD/MM/YY")
          }
          aria-label={ariaLabel}
          {...props}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 disabled:pointer-events-none disabled:opacity-45"
          aria-label={pickerLabel}
          disabled={disabled || readOnly}
          onClick={openPicker}
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
