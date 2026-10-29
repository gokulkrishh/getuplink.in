// A database of plain rows per table, behind enough of supabase-js's query builder for lib/server/data:
// select, insert, upsert (on a conflict key, optionally ignoring duplicates), update and delete, with the
// filters the data layer uses. Each query awaits a tick, so concurrent requests interleave as they would
// against PostgREST. Every query is recorded with its table, operation and filters.
// Streamed readings work as the shared_cars migration has them: telemetry_readings holds each reading once
// per VIN, the view user_telemetry_readings pairs it with each car row whose window covers it, and the
// forget_unseen_readings / prune_unseen_readings functions delete what no window covers.

export type Row = Record<string, unknown>;
export type Call = { table: string; op: string; filters: string[] };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  calls: Call[] = [];
  removedFiles: string[] = [];
  rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  clients = 0;
  // Tables to answer as missing (their migration not applied).
  missing = new Set<string>();
  // Tables whose new rows get the next id, like an identity column.
  autoIds = new Set<string>();
  // Answers a query with an error, as supabase-js does when the connection drops, while this returns true.
  failing: ((query: { table: string; op: string; patch: Row | null }) => boolean) | null = null;
  // Never answers a query while this returns true, until the query's abortSignal fires.
  stalling: ((query: { table: string; op: string; patch: Row | null }) => boolean) | null = null;

  withId(table: string, row: Row): Row {
    if (!this.autoIds.has(table) || row.id !== undefined) return row;
    const ids = this.rows(table).map((r) => Number(r.id) || 0);
    return { ...row, id: Math.max(0, ...ids) + 1 };
  }

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = tables;
  }

  client() {
    this.clients++;
    return {
      from: (table: string) => new FakeQuery(this, table),
      rpc: async (fn: string, args: Record<string, unknown>) => (this.rpcs.push({ fn, args }), { data: this.callRpc(fn, args), error: null }),
      storage: { from: () => ({ remove: async (paths: string[]) => (this.removedFiles.push(...paths), { data: null, error: null }) }) },
    };
  }

  rows(table: string): Row[] {
    if (table === READINGS_VIEW) return this.visibleReadings();
    return (this.tables[table] ??= []);
  }

  // Each reading once per car row whose window covers it, with that row's user (the view).
  private visibleReadings(): Row[] {
    return this.rows("telemetry_readings").flatMap((r) => this.linksSeeing(r).map((v) => ({ ...r, user_id: v.user_id })));
  }

  private linksSeeing(reading: Row): Row[] {
    const at = Date.parse(reading.created_at as string);
    return this.rows("vehicles").filter(
      (v) =>
        v.vin === reading.vin &&
        (v.readings_from === undefined || at >= Date.parse(v.readings_from as string)) &&
        (v.readings_until === undefined || v.readings_until === null || at < Date.parse(v.readings_until as string)),
    );
  }

  private forget(vin: string, limit: number): number {
    const unseen = this.rows("telemetry_readings").filter((r) => r.vin === vin && this.linksSeeing(r).length === 0).slice(0, limit);
    this.tables.telemetry_readings = this.rows("telemetry_readings").filter((r) => !unseen.includes(r));
    return unseen.length;
  }

  private callRpc(fn: string, args: Record<string, unknown>): unknown {
    if (fn === "forget_unseen_readings") return this.forget(args.p_vin as string, args.p_limit as number);
    if (fn === "prune_unseen_readings") {
      let left = args.p_limit as number;
      for (const vin of new Set(this.rows("telemetry_readings").map((r) => r.vin as string))) left -= this.forget(vin, left);
      return (args.p_limit as number) - left;
    }
    return [];
  }
}

const READINGS_VIEW = "user_telemetry_readings";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

type Filter = [string, (r: Row) => boolean];

class FakeQuery {
  private op = "select";
  private patch: Row | null = null;
  private values: Row[] = [];
  private conflict: string[] | null = null;
  private ignoreDuplicates = false;
  private filters: Filter[] = [];
  private max: number | null = null;
  private span: [number, number] | null = null;
  private sort: { column: string; ascending: boolean } | null = null;
  private signal: AbortSignal | null = null;
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.values = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.values = Array.isArray(rows) ? rows : [rows];
    this.conflict = options?.onConflict?.split(",") ?? null;
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([`${column} = ${value}`, (r) => r[column] === value]);
    return this;
  }
  // A missing column reads as not equal, like a column default other than the value.
  neq(column: string, value: unknown) {
    this.filters.push([`${column} <> ${value}`, (r) => r[column] !== value]);
    return this;
  }
  // ISO times compare as instants.
  gte(column: string, value: string) {
    this.filters.push([`${column} >= ${value}`, (r) => Date.parse(r[column] as string) >= Date.parse(value)]);
    return this;
  }
  lte(column: string, value: string) {
    this.filters.push([`${column} <= ${value}`, (r) => typeof r[column] === "string" && Date.parse(r[column] as string) <= Date.parse(value)]);
    return this;
  }
  gt(column: string, value: string) {
    this.filters.push([`${column} > ${value}`, (r) => typeof r[column] === "string" && Date.parse(r[column] as string) > Date.parse(value)]);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push([`${column} < ${value}`, (r) => Date.parse(r[column] as string) < Date.parse(value)]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push([`${column} in (${values.join(",")})`, (r) => values.includes(r[column])]);
    return this;
  }
  is(column: string, value: null) {
    if (value !== null) throw new Error(`Unexpected is(${column})`);
    this.filters.push([`${column} is null`, (r) => r[column] === null || r[column] === undefined]);
    return this;
  }
  not(column: string, op: string, value: unknown) {
    // "(a,b)" or "(\"a\",\"b\")": not in the list.
    if (op === "in" && typeof value === "string") {
      const values = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      this.filters.push([`${column} not in (${values.join(",")})`, (r) => !values.includes(String(r[column]))]);
      return this;
    }
    if (op !== "is" || value !== null) throw new Error(`Unexpected not(${column}, ${op})`);
    this.filters.push([`${column} is not null`, (r) => r[column] !== null && r[column] !== undefined]);
    return this;
  }
  // "a.is.null,a.lt.<iso>": the lease checks.
  or(expression: string) {
    const parts = expression.split(",").map((part) => {
      const [column, op, ...rest] = part.split(".");
      const value = rest.join(".");
      if (op === "is" && value === "null") return (r: Row) => r[column] === null || r[column] === undefined;
      if (op === "lt") return (r: Row) => typeof r[column] === "string" && Date.parse(r[column] as string) < Date.parse(value);
      if (op === "lte") return (r: Row) => typeof r[column] === "string" && Date.parse(r[column] as string) <= Date.parse(value);
      throw new Error(`Unexpected or(${part})`);
    });
    this.filters.push([`(${expression})`, (r) => parts.some((p) => p(r))]);
    return this;
  }
  order(column?: string, options?: { ascending?: boolean }) {
    if (column) this.sort = { column, ascending: options?.ascending !== false };
    return this;
  }
  range(from: number, to: number) {
    this.span = [from, to];
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  abortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }
  private async run(): Promise<{ data: Row[]; error: null }> {
    await tick();
    this.db.calls.push({ table: this.table, op: this.op, filters: this.filters.map(([d]) => d) });
    // A table whose migration isn't applied: PostgREST's "not in the schema cache".
    if (this.db.missing.has(this.table)) return { data: null, error: { message: `Could not find the table '${this.table}'`, code: "PGRST205" } } as never;
    if (this.db.stalling?.({ table: this.table, op: this.op, patch: this.patch })) {
      await new Promise((resolve) => this.signal?.addEventListener("abort", resolve));
      return { data: null, error: { message: `AbortError: ${this.signal?.reason?.message}` } } as never;
    }
    if (this.db.failing?.({ table: this.table, op: this.op, patch: this.patch })) return { data: null, error: { message: "TypeError: fetch failed" } } as never;
    const all = this.db.rows(this.table);
    const hit = (r: Row) => this.filters.every(([, f]) => f(r));
    if (this.op === "insert") {
      const added = this.values.map((v) => this.db.withId(this.table, { ...v }));
      all.push(...added);
      return { data: added, error: null };
    }
    if (this.op === "upsert") {
      const out: Row[] = [];
      for (const value of this.values) {
        const existing = this.conflict ? all.find((r) => this.conflict!.every((c) => r[c] === value[c])) : undefined;
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, value);
          if (!this.ignoreDuplicates) out.push({ ...existing });
        } else {
          const added = this.db.withId(this.table, { ...value });
          all.push(added);
          out.push({ ...added });
        }
      }
      return { data: out, error: null };
    }
    let matched = all.filter(hit);
    if (this.sort) {
      const { column, ascending } = this.sort;
      // Numbers and ISO times both compare in order with < and >.
      const key = (r: Row) => r[column] as number | string;
      matched = [...matched].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (ascending ? 1 : -1));
    }
    if (this.max !== null) matched = matched.slice(0, this.max);
    if (this.span) matched = matched.slice(this.span[0], this.span[1] + 1);
    // PostgREST's max_rows: a select returns at most 1,000 rows, whatever it asks for.
    if (this.op === "select") matched = matched.slice(0, 1000);
    if (this.table === READINGS_VIEW && this.op !== "select") throw new Error("The readings view is read only");
    if (this.op === "delete") this.db.tables[this.table] = all.filter((r) => !matched.includes(r));
    if (this.op === "update") for (const r of matched) Object.assign(r, this.patch);
    return { data: matched.map((r) => ({ ...r })), error: null };
  }
  async maybeSingle() {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    return { data: data[0] ?? null, error: null };
  }
  async single() {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    return { data: data[0] ?? null, error: data[0] ? null : { message: "No row", code: "PGRST116" } };
  }
  then<T>(resolve: (value: { data: Row[]; error: null; count?: number }) => T, reject?: (err: unknown) => T) {
    return this.run().then((result) => resolve({ ...result, count: result.data?.length ?? 0 }), reject);
  }
}
