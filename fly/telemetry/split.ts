// What one POST of rows to PostgREST came to: written, worth another try later (429, 5xx, no answer), or
// refused for good with its status and a short masked reason.
export type PostResult = { kind: "ok" } | { kind: "retry" } | { kind: "refused"; status: number; detail: string };

export type SendResult<T> = { written: number; refused: number; retry: T[] };

// Statuses one bad row can cause (bad data, a conflict, too large): halving the batch finds the row. Any other
// refusal (401, 403, 404) refuses every row alike, so splitting would only multiply the requests.
const ROW_STATUSES = new Set([400, 409, 413, 422]);
// Each split costs two requests. One bad row in 500 takes 9; past this many the rest is dropped whole, so a
// batch where every row is bad can't turn into a thousand requests.
const MAX_SPLITS = 20;

// Posts the rows. When PostgREST refuses them for a reason a row can cause, posts each half in turn, down to
// single rows, so only the rows it refuses are dropped (handed to `refuse`). After a failure worth retrying,
// `retry` holds every row not yet written, and nothing written is sent again.
export async function sendIsolating<T>(
  rows: T[],
  post: (rows: T[]) => Promise<PostResult>,
  refuse: (rows: T[], status: number, detail: string) => void,
  budget = { splits: MAX_SPLITS },
): Promise<SendResult<T>> {
  const result = await post(rows);
  if (result.kind === "ok") return { written: rows.length, refused: 0, retry: [] };
  if (result.kind === "retry") return { written: 0, refused: 0, retry: rows };
  if (rows.length === 1 || !ROW_STATUSES.has(result.status) || budget.splits <= 0) {
    refuse(rows, result.status, result.detail);
    return { written: 0, refused: rows.length, retry: [] };
  }
  budget.splits--;
  const half = Math.ceil(rows.length / 2);
  const first = await sendIsolating(rows.slice(0, half), post, refuse, budget);
  if (first.retry.length > 0) return { ...first, retry: first.retry.concat(rows.slice(half)) };
  const second = await sendIsolating(rows.slice(half), post, refuse, budget);
  return { written: first.written + second.written, refused: first.refused + second.refused, retry: second.retry };
}
