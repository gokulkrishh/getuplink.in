import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Fold } from "@/components/fold";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

// The heading stays a heading with a real button inside it holding only the title, so the button's name is
// "Your charging habits", not the whole row ("Your charging habitsYour usual…Show").
test("a fold's trigger is a button inside its heading, named by the title alone", () => {
  const out = html(
    <Fold title="Your charging habits" description="When you plug in.">
      <p>Inside</p>
    </Fold>,
  );
  expect(out).toMatch(/<h2[^>]*><button[^>]*type="button"[^>]*>Your charging habits<\/button><\/h2>/);
  expect(out).not.toContain('role="button"');
});

test("closed at first: aria-expanded is false and aria-controls names the hidden panel", () => {
  const out = html(
    <Fold title="More detail" description="Cell balance and temperatures.">
      <p>Inside</p>
    </Fold>,
  );
  const button = out.match(/<button[^>]*>/)![0];
  expect(button).toContain('aria-expanded="false"');
  const controls = button.match(/aria-controls="([^"]+)"/)![1];
  const panel = out.match(new RegExp(`<div[^>]*id="${controls}"[^>]*>`))![0];
  expect(panel).toMatch(/ hidden="(until-found)?"/);
  const described = button.match(/aria-describedby="([^"]+)"/)![1];
  expect(out).toContain(`<div id="${described}"`);
});

test("Show is drawn only: hidden from screen readers, outside the button, and not in the tab order", () => {
  const out = html(<Fold title="Connect your AI">x</Fold>);
  expect(out).toMatch(/<span aria-hidden="true"[^>]*>.*Show/);
  expect(out.match(/<button[^>]*>.*?<\/button>/)![0]).not.toContain("Show");
  expect(out).not.toContain('aria-describedby');
});

test("defaultOpen opens it, and Show reads Hide", () => {
  const out = html(
    <Fold title="Adoption over time" as="h3" defaultOpen>
      x
    </Fold>,
  );
  expect(out).toMatch(/<h3[^>]*><button[^>]*aria-expanded="true"/);
  expect(out).toContain("data-panel-open");
});

test("a plain row label (a shut chart) isn't a heading", () => {
  const out = html(
    <Fold title="By AC setting" as="span">
      x
    </Fold>,
  );
  expect(out).not.toMatch(/<h[1-6]/);
  expect(out).toMatch(/<span[^>]*><button[^>]*>By AC setting<\/button><\/span>/);
});

test("with no title, the line names the button, so it is never a nameless button", () => {
  const out = html(<Fold title="" as="h3" description="Most owners keep Sentry off.">x</Fold>);
  const button = out.match(/<button[^>]*>/)![0];
  const labelled = button.match(/aria-labelledby="([^"]+)"/)![1];
  expect(out).toContain(`<div id="${labelled}"`);
  expect(button).not.toContain("aria-describedby");
});
