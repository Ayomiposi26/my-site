import type { Outcome } from "@/lib/capstone-helpers";

function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Both options' saved results on one scale. The bar is the likely range,
 * the tick is the typical quarter, and the dashed line is the reader's target.
 */
export function OutcomeChart({
  candidates,
  outcomes,
  action,
  atLeast,
  unit,
  reader,
}: {
  candidates: { id: string; label: string }[];
  outcomes: Record<string, Outcome>;
  action: string;
  atLeast: number;
  unit: string;
  reader: string;
}) {
  const values = candidates.flatMap((candidate) => {
    const outcome = outcomes[candidate.id];
    return [outcome.low, outcome.high];
  });
  const min = Math.min(atLeast, ...values);
  const max = Math.max(atLeast, ...values);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const width = 640;
  const rowH = 72;
  const top = 28;
  const height = top + candidates.length * rowH + 8;
  const padL = 132;
  const padR = 16;
  const x = (value: number) => padL + ((value - lo) / (hi - lo || 1)) * (width - padL - padR);
  const target = x(atLeast);

  return (
    <figure data-capstone="outcome-chart" className="mt-4 rounded-lg border border-line bg-surface p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Comparison of both shops. The dashed line is ${reader}'s target of ${count(atLeast)} ${unit}.`}
      >
        <text x={target} y={16} fill="var(--ink)" fontSize="12" textAnchor="middle">
          {count(atLeast)} {unit}
        </text>
        <line
          x1={target}
          x2={target}
          y1={22}
          y2={height - 8}
          stroke="var(--ink)"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />
        {candidates.map((candidate, index) => {
          const outcome = outcomes[candidate.id];
          const y = top + 28 + index * rowH;
          const chosen = candidate.id === action;
          return (
            <g key={candidate.id}>
              <text x={0} y={y - 10} fill={chosen ? "var(--accent)" : "var(--ink)"} fontSize="14">
                {candidate.label}
              </text>
              <text x={0} y={y + 8} fill="var(--muted)" fontSize="12">
                typical {count(outcome.typical)}
              </text>
              <line
                x1={x(outcome.low)}
                x2={x(outcome.high)}
                y1={y}
                y2={y}
                stroke="var(--accent)"
                strokeWidth="10"
                strokeLinecap="round"
                opacity={chosen ? 0.9 : 0.4}
              />
              <line
                x1={x(outcome.typical)}
                x2={x(outcome.typical)}
                y1={y - 12}
                y2={y + 12}
                stroke="var(--ink)"
                strokeWidth="2.5"
              />
              <text x={padL} y={y + 24} fill="var(--muted)" fontSize="12">
                {count(outcome.low)} to {count(outcome.high)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 text-sm text-muted">
        The bar on each row is that shop&apos;s likely range. The dark tick is the typical quarter.
        The dashed line is {reader}&apos;s target of {count(atLeast)} {unit}.
      </figcaption>
    </figure>
  );
}
