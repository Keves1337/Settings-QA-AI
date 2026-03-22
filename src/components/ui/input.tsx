import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl px-3 py-2 text-sm text-foreground",
          "placeholder:text-white/30",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          className,
        )}
        style={{
          background: "rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
          e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.55)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.05)";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
          e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.05)";
          props.onBlur?.(e);
        }}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
