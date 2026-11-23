import { ComingSoon } from "@/components/ComingSoon";
import { HistoryChart } from "@/components/capstone/HistoryChart";
import { OutcomeChart } from "@/components/capstone/OutcomeChart";
import type { DagNode } from "@/lib/capstone-helpers";
import { loadLatest } from "@/lib/capstone-store";

export const metadata = { title: "Capstone" };
export const dynamic = "force-dynamic";

function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function inHundred(share: number): string {
  return `${(share * 100).toFixed(1)} in 100`;
}

function stepNote(node: DagNode): string {
  const timing =
    node.repeat === "once"
      ? "Drawn once for the whole quarter."
      : node.repeat === "daily"
        ? "Drawn again each working day."
        : node.repeat === "weekly"
          ? "Drawn again each week."
          : "Added up across the working days in that quarter.";

  return node.basedOn ? `${timing} Rests on ${node.basedOn} past days.` : timing;
}

export default async function CapstonePage() {
  const latest = await loadLatest();

  if (!latest) {
    return (
      <ComingSoon
        lane={5}
        title="Capstone: Decision Service + Report"
        description="A report that compares two options for one reader, using the answer saved from the decision service. Built after Lane 5."
      />
    );
  }

  const { probe, answer } = latest;
  const params = probe.scenario.params;
  const reader = String(params.reader);
  const unit = String(params.unit);
  const periodName = String(params.periodName);
  const chosen =
    probe.candidates.find((candidate) => candidate.id === answer.action) ??
    probe.candidates[0];
  const chosenOutcome = answer.outcomes[answer.action];
  const rows = probe.history.map((row) => ({
    shop: Number(row.shop),
    patrick: Number(row.patrick),
    cars: Number(row.cars),
  }));
  const daysThere = (shopId: string) => {
    const shop = Number(shopId.split("-").pop());
    return rows.filter((row) => row.shop === shop && row.patrick === 1).length;
  };
  const other = probe.candidates.find((candidate) => candidate.id !== answer.action);
  const otherOutcome = other ? answer.outcomes[other.id] : undefined;
  const periodLength = Number(params.periodLength);
  const periodUnit = String(params.periodUnit);
  const limitShare = Math.round(probe.limit.maxChance * 100);
  const otherMissesLimit =
    otherOutcome !== undefined && otherOutcome.chanceShort > probe.limit.maxChance;
  const chosenMeetsLimit = chosenOutcome.chanceShort <= probe.limit.maxChance;
  const daysByCandidate = probe.candidates.map((candidate) => ({
    label: candidate.label,
    days: daysThere(candidate.id),
  }));
  const thinner = [...daysByCandidate].sort((a, b) => a.days - b.days)[0];
  const thinnerIsUnique =
    thinner !== undefined &&
    daysByCandidate.filter((entry) => entry.days === thinner.days).length === 1;

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
        Lane 5 · live decision service
      </p>
      <h1 className="mt-3 text-4xl font-bold">
        {chosen.label} for the next {periodName}
      </h1>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">The decision</h2>
        <p data-capstone="recommendation" className="mt-3 max-w-prose">
          {reader}, work at {chosen.label} next {periodName}. The two shops
          together miss your {count(probe.limit.atLeast)}-car goal in{" "}
          {inHundred(chosenOutcome.chanceShort)} simulated {periodName}s, inside
          your limit of {Math.round(probe.limit.maxChance * 100)} in 100.
        </p>
        <ul className="mt-4 space-y-1 text-lg">
          <li>
            Recommendation: <strong>{chosen.label}</strong>
            <span data-capstone="action" className="sr-only">
              {answer.action}
            </span>
          </li>
          <li>
            Typical {periodName}:{" "}
            <strong data-capstone="typical-result" className="text-accent">
              {count(chosenOutcome.typical)}
            </strong>{" "}
            {unit}
          </li>
          <li>
            Chance of falling short of {count(probe.limit.atLeast)}:{" "}
            <strong data-capstone="chance-short" className="text-accent">
              {inHundred(chosenOutcome.chanceShort)}
            </strong>
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">The history</h2>
        <HistoryChart rows={rows} reader={reader} />
        <p className="mt-4 max-w-prose text-muted">
          Filled dots are days {reader} was there:{" "}
          {daysByCandidate.map((entry) => `${entry.days} at ${entry.label}`).join(", ")}.{" "}
          {thinner && thinnerIsUnique
            ? `${thinner.label} has fewer of those days, so its result is less certain.`
            : ""}
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">
          Work at {chosen.label}: it stays inside the {count(probe.limit.atLeast)}-car target
        </h2>
        <ul className="mt-3 space-y-2">
          {probe.candidates.map((candidate) => {
            const outcome = answer.outcomes[candidate.id];

            return (
              <li key={candidate.id}>
                <span className="font-medium">{candidate.label}.</span> Typical{" "}
                {periodName}: {count(outcome.typical)} {unit}. Likely range:{" "}
                {count(outcome.low)} to {count(outcome.high)}. Falls short of{" "}
                {count(probe.limit.atLeast)} in {inHundred(outcome.chanceShort)}{" "}
                simulated {periodName}s.
              </li>
            );
          })}
        </ul>
        <p className="mt-3 max-w-prose text-muted">
          {reader} can accept falling short in {limitShare} of 100 {periodName}s.
          {other && otherOutcome && chosenMeetsLimit && otherMissesLimit
            ? ` ${other.label} falls short in ${inHundred(otherOutcome.chanceShort)}, past that limit. ${chosen.label} falls short in ${inHundred(chosenOutcome.chanceShort)}, so that is the shop to work at.`
            : ""}
          {other && otherOutcome && otherOutcome.typical > chosenOutcome.typical
            ? ` ${other.label}'s typical ${periodName} is higher (${count(otherOutcome.typical)} ${unit}, against ${count(chosenOutcome.typical)}), and it still misses the limit too often.`
            : ""}{" "}
          Across the same simulated {periodName}s, {chosen.label} finished higher in{" "}
          {inHundred(answer.chanceActionBeatsOther)} runs.
        </p>
        <OutcomeChart
          candidates={probe.candidates}
          outcomes={answer.outcomes}
          action={answer.action}
          atLeast={probe.limit.atLeast}
          unit={unit}
          reader={reader}
        />
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">The recipe</h2>
        <ol
          data-capstone="dag"
          data-nodes={probe.dag.nodes.length}
          className="mt-4 list-decimal space-y-3 pl-5"
        >
          {probe.dag.nodes.map((node) => (
            <li key={node.id}>
              <span className="font-medium">{node.plain}</span>
              <span className="mt-0.5 block text-sm text-muted">
                {stepNote(node)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-prose text-muted">
          The comparison uses two versions of the same {periodLength} {periodUnit}{" "}
          {periodName}. In one, {reader} works at {probe.candidates[0]?.label} every
          day. In the other, {reader} works at {probe.candidates[1]?.label} every
          day. Each version adds up the cars both shops fix.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">How sure this is</h2>
        <p data-capstone="uncertainty" className="mt-3 max-w-prose text-muted">
          With you at {chosen.label}, the two shops together fixed between{" "}
          {count(chosenOutcome.low)} and {count(chosenOutcome.high)} cars in
          about 9 out of 10 simulated quarters. More days of records with you
          at Shop 2 would help us narrow the estimate for that option.
        </p>
      </section>
    </main>
  );
}