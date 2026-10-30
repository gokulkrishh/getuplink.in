import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "@/components/ui/alert-dialog";

test("a closed alert dialog renders nothing in place", () => {
  const html = renderToStaticMarkup(
    <AlertDialog open={false}>
      <AlertDialogContent>
        <AlertDialogTitle>End the link?</AlertDialogTitle>
      </AlertDialogContent>
    </AlertDialog>,
  );
  expect(html).not.toContain("End the link?");
});
