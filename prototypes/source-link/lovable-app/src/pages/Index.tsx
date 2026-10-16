import { useState } from "react"
import { AlertCircle, CalendarCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { PlanCard } from "@/components/PlanCard"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { bookDemo, plans } from "@/data/plans"

const Index = () => {
  const [plan, setPlan] = useState("team")
  const [size, setSize] = useState("11-50")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    try {
      await bookDemo({ ...form, plan, size })
      setDone(true)
      toast.success("Demo booked!", { description: "Check your inbox for the invite." })
    } catch {
      setError("We could not book your demo. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Book a demo</h1>
          <p className="text-muted-foreground">Pick a plan and we will walk you through it.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.id} {...p} selected={plan === p.id} onClick={() => setPlan(p.id)} />
          ))}
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-background p-8 text-center">
            <CalendarCheck className="size-10 text-emerald-600" />
            <p className="font-medium">You're booked. See you soon!</p>
            <Button variant="outline" onClick={() => setDone(false)}>
              Book another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-background p-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Booking failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Jane Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="jane@company.com" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Company size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger id="size" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1–10</SelectItem>
                  <SelectItem value="11-50">11–50</SelectItem>
                  <SelectItem value="51+">51+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Anything we should know?</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "Booking…" : "Book demo"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

export default Index
