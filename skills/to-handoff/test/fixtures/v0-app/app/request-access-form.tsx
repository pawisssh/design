"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

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
import { SubmitButton } from "@/components/submit-button"

type Status = "idle" | "loading" | "error" | "success"

export function RequestAccessForm() {
  const [status, setStatus] = useState<Status>("idle")
  const [team, setTeam] = useState("design")

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("loading")
    const body = Object.fromEntries(new FormData(event.currentTarget))
    const res = await fetch("/api/request-access", {
      method: "POST",
      body: JSON.stringify({ ...body, team }),
    })
    if (!res.ok) {
      setStatus("error")
      return
    }
    setStatus("success")
    toast.success("Request sent", { description: "We'll email you when it's approved." })
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-emerald-600" />
        <p className="font-medium">Thanks! Your request is in.</p>
        <Button variant="outline" onClick={() => setStatus("idle")}>
          Send another request
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>We could not send your request. Try again.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" placeholder="Ada Lovelace" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" placeholder="ada@example.com" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="team">Team</Label>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger id="team" className="w-full">
            <SelectValue placeholder="Pick a team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="design">Design</SelectItem>
            <SelectItem value="engineering">Engineering</SelectItem>
            <SelectItem value="research">Research</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reason">Why do you need access?</Label>
        <Textarea id="reason" name="reason" rows={3} />
      </div>
      <SubmitButton pending={status === "loading"} className="w-full">
        {status === "loading" ? "Sending…" : "Request access"}
      </SubmitButton>
    </form>
  )
}
