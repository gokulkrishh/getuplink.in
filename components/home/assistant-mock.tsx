import { Logo } from "@/components/logo";
import { Bar, FigureStage, SATELLITE, SURFACE } from "@/components/home/figure";

// "Ask your AI about your car": an AI assistant answering from Uplink's connector, with the connector on
// the chat's top edge. The amounts are illustrative.
export function AssistantMock() {
  return (
    <FigureStage className="h-[380px] sm:h-[420px]">
      <div className={`absolute top-10 right-10 left-5 h-[440px] rounded-xl p-5 text-sm sm:top-14 sm:right-14 sm:left-8 sm:p-6 ${SURFACE}`}>
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-3.5 py-2">How much did I spend on charging in October?</p>
        <p className="mt-5 text-xs text-faint">Looked at your charging</p>
        <p className="mt-1.5 leading-relaxed">
          ₹3,180 over 9 charges. ₹2,438 at Superchargers and ₹742 on ChargeMOD.
        </p>
        {/* The next question, as filler running off the bottom. */}
        <div className="mt-6 ml-auto w-3/5 rounded-2xl bg-muted px-3.5 py-3">
          <Bar className="w-full" />
          <Bar className="mt-2 w-2/3" />
        </div>
        <Bar className="mt-6 w-24 opacity-60" />
        <Bar className="mt-3 w-4/5" />
        <Bar className="mt-2.5 w-3/5" />
        <div className="mt-6 ml-auto w-2/5 rounded-2xl bg-muted px-3.5 py-3">
          <Bar className="w-full" />
        </div>
      </div>

      {/* The connector, sitting on the chat's top edge. */}
      <span
        className={`absolute top-10 right-16 flex -translate-y-1/2 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-3 text-xs font-medium sm:top-14 sm:right-20 ${SATELLITE}`}
      >
        <Logo className="size-3.5" />
        Uplink connector
      </span>
    </FigureStage>
  );
}
