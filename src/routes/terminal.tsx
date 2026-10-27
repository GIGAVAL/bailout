import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/bailout/Game";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Bailout Terminal — Structural Credit Trading" },
      { name: "description", content: "Pull steel, follow the load path, track credit ratings, and short the building. In buildings, there's no bailout." },
      { property: "og:title", content: "Bailout Terminal — Structural Credit Trading" },
      { property: "og:description", content: "Trade structural risk in Bailout's interactive 2D and 3D terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});