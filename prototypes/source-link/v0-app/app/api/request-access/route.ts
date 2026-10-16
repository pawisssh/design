// Stand-in: fake latency, no real backend.
export async function POST(request: Request) {
  const body = await request.json()
  await new Promise((resolve) => setTimeout(resolve, 800))
  if (String(body.email).includes("fail")) {
    return Response.json({ error: "rejected" }, { status: 500 })
  }
  return Response.json({ ok: true })
}
