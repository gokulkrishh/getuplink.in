import { useId } from "react";
import { blobColors, blobPath } from "@/lib/blob";

// A soft colour orb: three blurred blobs in colours from the seed, filling the circle and drifting
// slowly around each other. Each blob spins inside a group that places it, since a CSS animation
// replaces the element's own transform. Still for anyone who prefers reduced motion.
export function AvatarBlob({ seed }: { seed: string }) {
  const blur = useId();
  const [base, second, third] = blobColors(seed);
  return (
    <svg viewBox="0 0 40 40" className="size-full" aria-hidden>
      <defs>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <rect width="40" height="40" fill={base} />
      <g filter={`url(#${blur})`}>
        <g transform="translate(-2 -4)">
          <path
            d={blobPath(`${seed}:a`, 28)}
            fill={second}
            className="origin-center [transform-box:fill-box] motion-safe:animate-[spin_14s_linear_infinite]"
          />
        </g>
        <g transform="translate(16 14)">
          <path
            d={blobPath(`${seed}:b`, 26)}
            fill={third}
            className="origin-center [transform-box:fill-box] motion-safe:animate-[spin_20s_linear_infinite_reverse]"
          />
        </g>
      </g>
    </svg>
  );
}
