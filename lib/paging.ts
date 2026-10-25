// Bounded paging, for APIs that hand back a list a page at a time.

// Pages 1, 2, ... until one comes back short (the last page) or maxPages is reached. `complete` is false
// only when the cap stopped the loop on a full page, so there may be more. A failing page throws.
export async function readPages<T>(
  fetchPage: (pageNo: number) => Promise<T[]>,
  { pageSize, maxPages, pauseMs = 0 }: { pageSize: number; maxPages: number; pauseMs?: number },
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    if (pageNo > 1 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const page = await fetchPage(pageNo);
    items.push(...page);
    if (page.length < pageSize) return { items, complete: true };
  }
  return { items, complete: false };
}

// PostgREST returns at most 1000 rows per request (Supabase's default max_rows), whatever .limit() asks
// for, so a full read goes by .range() until a short page. The query should order by a unique key last,
// so rows can't shift between pages. maxRows is a backstop; an error stops the read and is returned.
export const ROW_PAGE = 1000;

export async function readAllRows<T, E>(
  fetchRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
  maxRows = 50 * ROW_PAGE,
): Promise<{ data: T[]; error: E | null }> {
  const data: T[] = [];
  for (let from = 0; from < maxRows; from += ROW_PAGE) {
    const { data: page, error } = await fetchRange(from, from + ROW_PAGE - 1);
    if (error) return { data, error };
    data.push(...(page ?? []));
    if ((page?.length ?? 0) < ROW_PAGE) break;
  }
  return { data, error: null };
}
