// A data table's box: rounded and bordered, its row lines and hover band running edge to edge. The room at
// the sides is on the first and last cell of each row, not the box. The header band sits flush with the top
// and the box clips it to the rounded corners; 8px under the last row keeps it clear of the bottom ones.
// Also on the tables that don't scroll, and their skeletons, so they can't drift apart.
export const TABLE_FRAME = "overflow-hidden rounded-lg border pb-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";

// A table's header: a faint band of one fixed height, 40px on a phone and 48px on a wider screen, its
// text centred up and down so the room above and below is the same. A header that wraps grows to fit.
// TABLE_HEAD is for a header drawn as a grid of spans, TABLE_HEAD_ROW for a <thead> row, where the height
// is on its cells.
export const TABLE_HEAD = "bg-muted min-h-10 items-center! sm:min-h-12";
export const TABLE_HEAD_ROW = "bg-muted [&>th]:h-10 [&>th]:align-middle sm:[&>th]:h-12";
