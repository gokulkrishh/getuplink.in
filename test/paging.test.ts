import { describe, expect, test } from "bun:test";
import { readAllRows, readPages, ROW_PAGE } from "@/lib/paging";

// A list served `size` at a time, recording the pages asked for.
function pages(total: number, size: number) {
  const asked: number[] = [];
  const fetchPage = async (pageNo: number) => {
    asked.push(pageNo);
    const start = (pageNo - 1) * size;
    return Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, k) => start + k);
  };
  return { asked, fetchPage };
}

describe("readPages", () => {
  test("stops on the first short page", async () => {
    const { asked, fetchPage } = pages(120, 50);
    const { items, complete } = await readPages(fetchPage, { pageSize: 50, maxPages: 10 });
    expect(asked).toEqual([1, 2, 3]);
    expect(items).toHaveLength(120);
    expect(complete).toBe(true);
  });

  test("an empty page after full ones ends the read", async () => {
    const { asked, fetchPage } = pages(100, 50);
    const { items, complete } = await readPages(fetchPage, { pageSize: 50, maxPages: 10 });
    expect(asked).toEqual([1, 2, 3]);
    expect(items).toHaveLength(100);
    expect(complete).toBe(true);
  });

  test("no history at all is one empty page, complete", async () => {
    const { asked, fetchPage } = pages(0, 50);
    expect(await readPages(fetchPage, { pageSize: 50, maxPages: 10 })).toEqual({ items: [], complete: true });
    expect(asked).toEqual([1]);
  });

  test("stops at the cap on a full page and says there may be more", async () => {
    const { asked, fetchPage } = pages(1_000, 50);
    const { items, complete } = await readPages(fetchPage, { pageSize: 50, maxPages: 4 });
    expect(asked).toEqual([1, 2, 3, 4]);
    expect(items).toHaveLength(200);
    expect(complete).toBe(false);
  });

  test("a failing page throws", async () => {
    const fetchPage = async (pageNo: number) => {
      if (pageNo === 2) throw new Error("429");
      return [1, 2];
    };
    await expect(readPages(fetchPage, { pageSize: 2, maxPages: 5 })).rejects.toThrow("429");
  });

  test("pauses between pages, not before the first", async () => {
    const times: number[] = [];
    const fetchPage = async () => {
      times.push(Date.now());
      return times.length < 3 ? [1] : [];
    };
    await readPages(fetchPage, { pageSize: 1, maxPages: 5, pauseMs: 30 });
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(25);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(25);
  });
});

describe("readAllRows", () => {
  const table = (total: number) => {
    const ranges: [number, number][] = [];
    const fetchRange = async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, k) => from + k), error: null };
    };
    return { ranges, fetchRange };
  };

  test("reads past PostgREST's 1000-row cap until a short page", async () => {
    const { ranges, fetchRange } = table(2_345);
    const { data, error } = await readAllRows(fetchRange);
    expect(error).toBeNull();
    expect(data).toHaveLength(2_345);
    expect(data.at(-1)).toBe(2_344);
    expect(ranges).toEqual([
      [0, ROW_PAGE - 1],
      [ROW_PAGE, 2 * ROW_PAGE - 1],
      [2 * ROW_PAGE, 3 * ROW_PAGE - 1],
    ]);
  });

  test("exactly 1000 rows takes one more, empty, read", async () => {
    const { ranges, fetchRange } = table(ROW_PAGE);
    expect((await readAllRows(fetchRange)).data).toHaveLength(ROW_PAGE);
    expect(ranges).toHaveLength(2);
  });

  test("stops at maxRows", async () => {
    const { ranges, fetchRange } = table(10_000);
    expect((await readAllRows(fetchRange, 3 * ROW_PAGE)).data).toHaveLength(3 * ROW_PAGE);
    expect(ranges).toHaveLength(3);
  });

  test("returns the error and what was read before it", async () => {
    let calls = 0;
    const { data, error } = await readAllRows(async (from) => {
      calls++;
      return calls === 2 ? { data: null, error: { message: "boom" } } : { data: Array.from({ length: ROW_PAGE }, (_, k) => from + k), error: null };
    });
    expect(error).toEqual({ message: "boom" });
    expect(data).toHaveLength(ROW_PAGE);
  });
});
