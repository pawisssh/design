import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RequestAccessForm } from "./request-access-form"

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <CardTitle>Request workspace access</CardTitle>
          </div>
          <CardDescription>
            Tell us who you are and an admin will approve you within a day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestAccessForm />
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>Already a member?</span>
          <Button asChild variant="link" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
