import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/bailout/Game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bailout Terminal — Structural Credit Trading" },
      {
        name: "description",
        content: "Trade structural risk in Bailout Terminal: pull steel members, follow live credit ratings, and short the building. In buildings, there's no bailout.",
      },
      { property: "og:title", content: "Bailout Terminal — Structural Credit Trading" },
      {
        property: "og:description",
        content: "An amber-and-black structural trading terminal. Pull steel, track savings and ratings, and watch AAA become default.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
