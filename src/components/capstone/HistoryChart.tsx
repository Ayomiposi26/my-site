type HistoryRow = { shop: number; patrick: number; cars: number };

/**
 * Every past day in the saved problem, one dot per history row.
 * Filled dots are days the reader was there. Open dots are days away.
 */
export function HistoryChart({ rows, reader }: { rows: HistoryRow[]; reader: string }) {
  const cars = rows.map((row) => row.cars);
  const lo = Math.min(...cars) - 2;
  const hi = Math.max(...cars) + 2;
  const shops = [...new Set(rows.map((row) => row.shop))].sort((a, b) => a - b);
  const width = 640;
  const height = 148;
  const padL = 32;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const y = (value: number) => padT + (1 - (value - lo) / (hi - lo || 1)) * (height - padT - padB);

  return (
    <figure
      data-capstone="all-data-chart"
      data-points={rows.length}
      className="mt-4 rounded-lg border border-line bg-surface p-4"
    >
      <div className="space-y-6">
        {shops.map((shop) => {
          const points = rows.filter((row) => row.shop === shop);
          const x = (index: number) =>
            padL + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - padL - padR));
          return (
            <div key={shop}>
              <p className="text-sm font-medium">Shop {shop}</p>
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="mt-1 w-full"
                role="img"
                aria-label={`Shop ${shop}: ${points.length} past days of cars fixed.`}
              >
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={height - padB}
                  y2={height - padB}
                  stroke="var(--line)"
                />
                <text x={0} y={y(hi) + 4} fill="var(--muted)" fontSize="11">
                  {Math.round(hi)}
                </text>
                <text x={0} y={height - padB} fill="var(--muted)" fontSize="11">
                  {Math.round(lo)}
                </text>
                {points.map((row, index) => (
                  <circle
                    key={`${shop}-${index}`}
                    cx={x(index)}
                    cy={y(row.cars)}
                    r="3.2"
                    fill={row.patrick === 1 ? "var(--accent)" : "var(--paper)"}
                    stroke={row.patrick === 1 ? "var(--accent)" : "var(--muted)"}
                    strokeWidth="1.4"
                  />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          {reader} there
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-muted bg-paper" />
          {reader} away
        </span>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        All {rows.length} past days. Each dot is one day at one shop, in the order the history lists them.
      </figcaption>
    </figure>
  );
}
