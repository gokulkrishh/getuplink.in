import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// /agents.md lists every connector tool (app/agents.md/route.ts says to keep it in step with the route).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("agents.md", () => {
  test("its tool table has a row for every connector tool", () => {
    const tools = [...read("app/api/mcp/route.ts").matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(tools).toContain("get_owner_comparisons");
    const table = read("app/agents.md/route.ts");
    for (const tool of tools) expect(table).toContain(`| \\\`${tool}\\\` |`);
  });
});
