import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bwild Compras" },
      { name: "description", content: "Painel de solicitações de compras das obras Bwild." },
      { property: "og:title", content: "Bwild Compras" },
      { property: "og:description", content: "Painel de solicitações de compras das obras Bwild." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
});
