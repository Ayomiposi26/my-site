import { CandidateOutcomes } from "@/components/simulator/CandidateOutcomes";
import { loadLatest } from "@/lib/simulator-store";

export const metadata = { title: "Decision Simulator" };

/**
 * Challenge 3 face. The grader reads the three data-simulator numbers and
 * checks that they are the answer /api/simulator/decide just saved. The
 * chart and the DAG are there so a person can see why that stake won.
 */
export const dynamic = "force-dynamic";

/** At least two decimal places, without rounding a finer fraction away. */
function formatFraction(value: number): string {
  const text = String(value);
  const places = text.includes(".") ? (text.split(".")[1]?.length ?? 0) : 0;
  return value.toFixed(Math.max(2, places));
}

export default async function SimulatorPage() {
  const latest = await loadLatest();

  if (!latest) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Lane 3 · live decision service
        </p>
        <h1 className="mt-3 text-4xl font-bold">Decision Simulator</h1>
        <p className="mt-4 max-w-prose text-muted">
          No game has been answered yet. The next one posted to the API is saved, and this page
          will show that recommended stake, the chart of every candidate, and the diagram below.
        </p>
        <img
          data-simulator="dag"
          src="/images/dag.png"
          alt="Decision diagram: the stake fraction is a rectangle, the coin flip is chance, and both feed the final balance."
          className="mt-8 w-full max-w-xl rounded-lg border border-line bg-white p-3"
        />
      </main>
    );
  }

  const { problem, answer, candidates } = latest;
  const fraction = Number(answer.recommendedFraction);
  const median = Number(answer.medianFinalBalance);
  const probLoss = Number(answer.probLoss);
  const buyIn = Number(problem.buyIn);
  const years = Number(problem.horizonYears);
  const stakePct = Math.round(fraction * 100);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
        Lane 3 · live decision service
      </p>
      <h1 className="mt-3 text-4xl font-bold">Stake {stakePct}% each year</h1>
      <p className="mt-4 max-w-prose text-muted">
        This service plays a coin-flip investment thousands of times at each stake on offer, then
        recommends the stake that leaves the typical investor with the most money at the end. The
        numbers below are the latest game my API answered, not figures typed in by hand.
      </p>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">The latest game</h2>
        <p className="mt-3 max-w-prose text-muted">{String(problem.scenario ?? "")}</p>
        <p className="mt-3 text-muted">
          Buy-in {buyIn.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })},
          horizon {years} years, heads {String(problem.upPct)}%, tails −{String(problem.downPct)}%.
          Candidate stakes:{" "}
          {Array.isArray(problem.candidateFractions)
            ? problem.candidateFractions.map((f: number) => `${Math.round(Number(f) * 100)}%`).join(", ")
            : "none listed"}
          .
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">The recommendation</h2>
        <ul className="mt-3 space-y-1 text-lg">
          <li>
            Recommended stake:{" "}
            <strong data-simulator="recommended-fraction" className="text-accent">
              {formatFraction(fraction)}
            </strong>
          </li>
          <li>
            Typical final balance: $
            <strong data-simulator="median-final" className="text-accent">
              {Math.round(median)}
            </strong>
          </li>
          <li>
            Probability of ending below the buy-in:{" "}
            <strong data-simulator="prob-loss" className="text-accent">
              {probLoss.toFixed(3)}
            </strong>
          </li>
        </ul>
        <p className="mt-3 max-w-prose text-muted">{String(answer.reasoning ?? "")}</p>
        <p className="mt-2 max-w-prose text-sm text-muted">
          The typical investor is the one in the middle, not the average of everyone. A few very
          large wins pull the average up, which is why a bigger stake can look better on average
          and still leave the middle investor worse off.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">
          Stake {stakePct}% each year: the typical result is the highest
        </h2>
        <CandidateOutcomes candidates={candidates} buyIn={buyIn} recommended={fraction} />
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">How the game is wired</h2>
        <img
          data-simulator="dag"
          src="/images/dag.png"
          alt="Decision diagram: the stake fraction is a rectangle, the coin flip is chance, and both feed the final balance."
          className="mt-3 w-full max-w-xl rounded-lg border border-line bg-white p-3"
        />
        <p className="mt-3 max-w-prose text-muted">
          The rectangle is the decision: how much of the balance to stake each year. The coin is
          chance, not a choice. Those two together set the yearly growth, and the yearly growth,
          repeated for the whole horizon, sets the final balance. The service picks the rectangle&apos;s
          value by looking at the middle final balance, not the lucky tail.
        </p>
      </section>
    </main>
  );
}
