import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: [
          "text-white font-semibold",
          "bg-gradient-to-br from-indigo-500/80 via-violet-500/70 to-purple-600/80",
          "border border-white/20",
          "shadow-[0_4px_20px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]",
          "backdrop-blur-sm",
          "hover:from-indigo-500/90 hover:via-violet-500/80 hover:to-purple-600/90",
          "hover:shadow-[0_6px_28px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]",
          "hover:scale-[1.02] active:scale-[0.98]",
        ].join(" "),
        destructive: [
          "text-white font-semibold",
          "bg-gradient-to-br from-red-500/80 to-rose-600/80",
          "border border-white/15",
          "shadow-[0_4px_16px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
          "hover:from-red-500/90 hover:to-rose-600/90",
          "hover:scale-[1.02] active:scale-[0.98]",
        ].join(" "),
        outline: [
          "text-white/80 hover:text-white",
          "border border-white/15 hover:border-white/25",
          "hover:bg-white/6",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
          "backdrop-blur-sm",
        ].join(" "),
        secondary: [
          "text-white/80 hover:text-white font-medium",
          "bg-white/8 hover:bg-white/12",
          "border border-white/10 hover:border-white/18",
          "backdrop-blur-sm",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
          "hover:scale-[1.01] active:scale-[0.99]",
        ].join(" "),
        ghost: [
          "text-white/60 hover:text-white/90",
          "hover:bg-white/7",
          "rounded-xl",
        ].join(" "),
        link: "text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
