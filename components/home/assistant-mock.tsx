// A static copy of an AI assistant using Uplink's MCP connector: a question about charging spend and a
// bot attaching an invoice from Gmail. The amounts and dates are illustrative.
const TURNS = [
  {
    ask: "How much did I spend on charging in October?",
    tool: "get_charging_summary",
    step: "Looked at your charging",
    answer: "₹3,180 over 9 charges. ₹2,438 at Superchargers and ₹742 on ChargeMOD.",
  },
  {
    ask: "Any new charging invoices in my Gmail?",
    tool: "attach_charge_invoice",
    step: "Attached the invoice",
    answer: "Found one from ChargeMOD for ₹412 and attached it to your charge on 21 Oct.",
  },
];

export function AssistantMock() {
  return (
    <div aria-hidden="true" className="rounded-lg border bg-background p-6 text-sm select-none">
      <div className="flex items-baseline justify-between gap-4 text-xs text-faint">
        <span className="tracking-wide uppercase">Your AI</span>
        <span className="font-mono">Uplink connector</span>
      </div>
      <ol className="mt-4">
        {TURNS.map((t) => (
          <li key={t.tool} className="border-t py-4">
            <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-muted px-3 py-2">{t.ask}</p>
            <p className="mt-3 text-xs text-faint">{t.step}</p>
            <p className="mt-1.5 text-muted-foreground">{t.answer}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
