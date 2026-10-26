import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET as robots } from "@/app/robots.txt/route";
import { METADATA_PATHS } from "@/lib/site";
import { proxy } from "@/proxy";

// Link previews (Slack, WhatsApp, X, LinkedIn, iMessage) fetch the page and its preview image with no
// cookie and don't follow a redirect to a sign-in page, so icons and images must load on every host.

const HOSTS = ["getuplink.in", "www.getuplink.in", "app.getuplink.in", "status.getuplink.in"];

const visit = (host: string, path: string) =>
  proxy(new NextRequest(`https://${host}${path}?abc123`, { headers: { host } }));

describe("icons and preview images without a session", () => {
  for (const host of HOSTS) {
    test(host, async () => {
      for (const path of METADATA_PATHS) {
        const res = await visit(host, path);
        expect({ path, location: res.headers.get("location") }).toEqual({ path, location: null });
        expect(res.status).toBe(200);
      }
    });
  }

  test("the home page still opens signed out on getuplink.in", async () => {
    const res = await visit("getuplink.in", "/");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/home");
  });
});

describe("robots.txt", () => {
  const read = (host: string) => robots(new Request(`https://${host}/robots.txt`, { headers: { host } })).text();

  test("every host allows the preview images and icons", async () => {
    for (const host of HOSTS) {
      const body = await read(host);
      for (const path of ["/opengraph-image", "/home/opengraph-image", "/status/opengraph-image", "/favicon.ico"]) {
        expect(body).toContain(`Allow: ${path}\n`);
      }
    }
  });

  test("on the app host, link preview bots may read invites; other crawlers may not", async () => {
    const body = await read("app.getuplink.in");
    const [previews, everyone] = body.split("\n\n");
    expect(previews).toContain("User-agent: Slackbot\n");
    expect(previews).toContain("User-agent: Twitterbot\n");
    expect(previews).toContain("Allow: /invite/\n");
    expect(everyone).toStartWith("User-agent: *\n");
    expect(everyone).not.toContain("Allow: /invite/\n");
    expect(everyone).toEndWith("Disallow: /\n");
  });
});
