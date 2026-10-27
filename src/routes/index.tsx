import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import closeup from "@/assets/big-short.png.asset.json";
import scene from "@/assets/Big_SHort_Jenga.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bailout — In buildings, there's no bailout." },
      {
        name: "description",
        content: "From the Jenga scene in The Big Short to structural risk: explore the idea behind Bailout, then enter the trading terminal.",
      },
      { property: "og:title", content: "Bailout — In buildings, there's no bailout." },
      {
        property: "og:description",
        content: "A tower of AAA promises. A real load path. Discover Bailout and enter the structural trading terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Introduction,
});

function Introduction() {
  return (
    <main className="bailout-intro">
      <header className="intro-header">
        <span className="text-primary font-extrabold">BAILOUT</span>
        <span className="text-label">STRUCTURAL CREDIT / OPENING NOTE</span>
      </header>
      <section className="intro-cover">
        <img className="intro-cover-image" src={closeup.url} alt="A hand gestures toward a Jenga tower marked with credit ratings in The Big Short." />
        <div className="intro-cover-copy">
          <div className="intro-inner">
            <p className="text-label text-xs">AAA → A → BBB → JUNK → D</p>
            <h1>BAILOUT</h1>
            <p className="intro-tagline">In buildings, there's no bailout.</p>
            <Button asChild variant="terminal" className="intro-enter">
              <Link to="/terminal">ENTER TERMINAL &lt;GO&gt; <ArrowRight aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="intro-story intro-inner">
        <div>
          <p className="text-label text-xs mb-4">THE BIG SHORT / THE JENGA MOMENT</p>
          <h2>A rating isn't a load path.</h2>
          <p>In <em>The Big Short</em>, a Jenga tower makes financial risk tangible: pull the wrong pieces and the whole stack comes down.</p>
          <p>Bailout takes that metaphor into a steel building. Every removed member saves money. The loads don't disappear; they move to whatever is left.</p>
          <p>The question isn't just what you can take out. It's what still carries the weight.</p>
          <p className="intro-note">An independent educational project. No affiliation with or endorsement by the film or its creators. All numerical results are illustrative estimates. No real money.</p>
        </div>
        <figure>
          <img src={scene.url} alt="The Jenga demonstration scene from The Big Short." loading="lazy" />
          <figcaption>Film reference: <em>The Big Short</em> (2015).</figcaption>
        </figure>
      </section>
      <footer className="intro-footer text-muted-foreground">BAILOUT / IN BUILDINGS, THERE'S NO BAILOUT.</footer>
    </main>
  );
}
