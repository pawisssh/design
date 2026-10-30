import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const chipVariants = cva(
  "inline-flex h-6 items-center rounded-md border px-2.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        primary: "bg-background text-primary",
      },
      selected: {
        false: "",
        true: "border-ring",
      },
    },
    compoundVariants: [
      { tone: "neutral", selected: true, className: "bg-secondary px-3" },
      { tone: ["primary"], selected: true, className: "bg-primary px-3 text-primary-foreground" },
    ],
    defaultVariants: {
      tone: "neutral",
      selected: false,
    },
  }
)

function Chip({
  className,
  tone,
  selected,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return (
    <span
      data-slot="chip"
      className={cn(chipVariants({ tone, selected, className }))}
      {...props}
    />
  )
}

export { Chip, chipVariants }
