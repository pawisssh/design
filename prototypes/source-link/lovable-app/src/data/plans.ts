// Stand-in: mock data and a fake API.
export const plans = [
  { id: "starter", name: "Starter", price: "$0", blurb: "For trying things out" },
  { id: "team", name: "Team", price: "$12", blurb: "For small teams" },
  { id: "scale", name: "Scale", price: "$29", blurb: "For growing companies" },
]

export function bookDemo(data: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) =>
    setTimeout(() => (data.email.includes("fail") ? reject(new Error("rejected")) : resolve()), 800),
  )
}
