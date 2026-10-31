// The #284 shapes: a --color-* chain to a Foundations token (bg-card, text-primary, border-primary), a palette colour
// Foundations lacks (bg-blue-500), a text colour the children inherit, and a global border-color reset. The #285
// shapes: equal and unequal padding sides, a radius chain to a Foundations token (rounded-lg), rounded-full, a flex
// gap, a gap on a block, auto margins beside a set one, a shorthand margin with auto sides, an auto margin a
// wider breakpoint sets, and percentage padding and margin.
export default function App() {
  return (
    <main id="summary" className="bg-card">
      <section id="totals" className="text-primary p-4 rounded-lg">
        <h1>Three funds to sell</h1>
        <p>Sell evenly across them.</p>
      </section>
      <p id="badge" className="bg-blue-500 px-4 py-2 rounded-full">Rebalanced</p>
      <div id="framed" className="border border-primary">Framed</div>
      <ul id="funds" className="flex gap-3">
        <li>Fund A</li>
        <li>Fund B</li>
      </ul>
      <div id="loose" className="gap-5">Not a flex container</div>
      <footer id="note" className="mt-6 mx-auto">Prices are indicative.</footer>
      <div id="centred" className="m-[16px_auto]">Centred</div>
      <div id="wide" className="mx-auto lg:mx-8">Wide</div>
      <div id="share" className="p-[10%] m-[5%]">Share</div>
    </main>
  );
}
