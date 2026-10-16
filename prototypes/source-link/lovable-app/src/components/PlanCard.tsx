import { Check } from "lucide-react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PlanCardProps = React.ComponentProps<typeof Card> & {
  name: string
  price: string
  blurb: string
  selected?: boolean
}

export function PlanCard({ name, price, blurb, selected, className, ...props }: PlanCardProps) {
  return (
    <Card className={cn("cursor-pointer", selected && "ring-2 ring-primary", className)} {...props}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {name}
          {selected && <Check className="size-4 text-primary" />}
        </CardTitle>
        <CardDescription>
          {price}/mo · {blurb}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
