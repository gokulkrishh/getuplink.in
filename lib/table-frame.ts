// A data table's box: rounded and bordered, its row lines and hover band running edge to edge. The room at
// the sides is on the first and last cell of each row, not the box. Its 8px top and bottom keep every row
// clear of the rounded corners, so nothing needs clipping. Also on the tables that don't scroll, and their
// skeletons, so they can't drift apart.
export const TABLE_FRAME = "rounded-lg border py-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";
