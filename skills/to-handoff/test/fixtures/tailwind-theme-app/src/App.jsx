// The #284 shapes: a --color-* chain to a Foundations token (bg-card, text-primary, border-primary), a palette colour
// Foundations lacks (bg-blue-500), a text colour the children inherit, and a global border-color reset.
export default function App() {
  return (
    <main id="summary" className="bg-card">
      <section id="totals" className="text-primary">
        <h1>Three funds to sell</h1>
        <p>Sell evenly across them.</p>
      </section>
      <p id="badge" className="bg-blue-500">Rebalanced</p>
      <div id="framed" className="border border-primary">Framed</div>
    </main>
  );
}
