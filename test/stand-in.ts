import { afterAll, mock } from "bun:test";

// Stands in for some of a module's functions while one test file runs, and hands every other call (and
// every call once the file is done) to the real ones. Bun's module mocks last for the whole run, so a
// mock that dropped the module's other exports would break the files after it.
export async function standIn(path: string, fakes: Record<string, (...args: never[]) => unknown>) {
  // A copy: mocking the module updates its namespace in place.
  const real = { ...((await import(path)) as Record<string, unknown>) };
  let active = true;
  afterAll(() => {
    active = false;
  });
  const wrapped = Object.fromEntries(
    Object.entries(fakes).map(([name, fake]) => [name, (...args: never[]) => (active ? fake(...args) : (real[name] as (...a: never[]) => unknown)(...args))]),
  );
  mock.module(path, () => ({ ...real, ...wrapped }));
}
