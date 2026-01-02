import { Elysia } from "elysia";

type NegotiationContext = {
  wantsHtml: boolean;
  wantsJson: boolean;
};

export const negotiationPlugin = new Elysia({
  name: "accept-negotiation",
}).derive<NegotiationContext>(({ request }) => {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");
  const wantsJson = accept.includes("application/json") || !wantsHtml;

  return {
    wantsHtml,
    wantsJson,
  };
});
