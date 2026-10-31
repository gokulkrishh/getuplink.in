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

// The trip table's columns, shared by TripRows and its skeleton SkTripRows so they can't drift apart. Fixed
// widths, so the rows fetched by Show more line up with the first. Distance comes right after When, and the two
// are narrower on a phone, so a 375px screen shows how far and how long before the table scrolls; there it sits
// on the left of its column, clear of the fade at the box's right edge.
export const TRIP_COLUMNS = [
  { label: "#", width: "w-10", cell: "" },
  { label: "When", width: "w-[8.5rem] sm:w-36", cell: "" },
  { label: "Distance · time", width: "w-24 sm:w-28", cell: "text-right max-sm:text-left" },
  { label: "Trip", width: "", cell: "sm:pl-3" },
  { label: "Energy · battery", width: "w-28", cell: "text-right" },
];
// On a phone the table keeps every column and scrolls sideways; from sm up it fits the page column.
export const TRIP_TABLE = "w-full table-fixed text-sm max-sm:min-w-[44rem]";

// The parked stretches' columns, shared by ParkedRows and its skeleton. Sized to their longest usual value,
// so all eight fit the page column from sm up; Average power takes what's left and its header wraps.
export const PARKED_COLUMNS = [
  { label: "#", width: "w-10" },
  { label: "Parked", width: "w-[9.75rem]" },
  { label: "For", width: "w-[5.75rem]" },
  { label: "Lost", width: "w-14", right: true },
  { label: "Range", width: "w-14", right: true },
  { label: "Energy", width: "w-[4.75rem]", right: true },
  { label: "Average power", width: "", right: true },
  { label: "Seen awake", width: "w-[5.5rem]", right: true },
];
// Scrolls sideways on a phone, fits the page column from sm up.
export const PARKED_TABLE = "w-full table-fixed text-sm max-sm:min-w-[48rem]";
