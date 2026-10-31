// Loaded before every test file (bunfig.toml [test] preload). Server modules import "server-only", which throws
// outside a React Server Component. Each test file runs in its own process (scripts/test-each.ts), so a file
// can't lean on another file having stubbed it first: every file gets the stub here.
import { mock } from "bun:test";

mock.module("server-only", () => ({}));
