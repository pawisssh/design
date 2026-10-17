import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  )
}
