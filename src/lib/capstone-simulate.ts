/**
 * Challenge 5: one simulated quarter for a staffing problem.
 *
 * The recipe is on the problem, not in this file. Each incoming probe
 * carries its own averages, daily spreads, quarter length, run count, and
 * shortfall limit. simulateRun() draws every node once, in the order the
 * recipe lists them. A "once" node is that shop's uncertain average for the
 * whole quarter. A "daily" node is one working day, redrawn each day around
 * its average. A "result" node adds the day's parent nodes, then those days
 * add up across the quarter.
 */

export interface CapstoneCandidate {
  id: string;
  label: string;
}

export interface DagNode {
  id: string;
  repeat: "once" | "daily" | "result";
  option?: string;
  draw?: {
    type: string;
    mean: number | string;
    sd: number;
  };
  compute?: string;
}

export interface CapstoneProblem {
  type: string;
  domain: string;
  candidates: CapstoneCandidate[];
  scenario: {
    params: {
      reader: string;
      unit: string;
      periodName: string;
      periodLength: number;
      periodUnit: string;
      runs: number;
    };
  };
  limit: {
    atLeast: number;
    maxChance: number;
  };
  dag: {
    nodes: DagNode[];
    edges: [string, string][];
  };
}

export interface OptionOutcome {
  typical: number;
  low: number;
  high: number;
  chanceShort: number;
}

export interface CapstoneAnswer {
  action: string;
  outcomes: Record<string, OptionOutcome>;
  chanceActionBeatsOther: number;
  betterAverageId: string;
  kind: "clear" | "tension";
  reasoning: string;
}

/** One standard normal draw, via Box-Muller. */
export function drawStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function drawNormal(mean: number, sd: number): number {
  return mean + sd * drawStandardNormal();
}

function parentIds(problem: CapstoneProblem, nodeId: string): string[] {
  return problem.dag.edges.filter(([, to]) => to === nodeId).map(([from]) => from);
}

function drawnMean(node: DagNode, values: Record<string, number>): number {
  const mean = node.draw?.mean;
  if (typeof mean === "number") return mean;
  if (typeof mean === "string" && Number.isFinite(values[mean])) return values[mean];
  throw new Error(`node ${node.id} has no number to draw around`);
}

/**
 * One possible quarter. Returns each option's total for this run.
 * Both options are drawn inside the same run so they share that run's averages.
 */
export function simulateRun(problem: CapstoneProblem): Record<string, number> {
  const days = problem.scenario.params.periodLength;
  const values: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const candidate of problem.candidates) totals[candidate.id] = 0;

  for (const node of problem.dag.nodes) {
    if (node.repeat !== "once") continue;
    if (node.draw?.type !== "normal" || typeof node.draw.sd !== "number") {
      throw new Error(`node ${node.id} is not a normal draw`);
    }
    values[node.id] = drawNormal(drawnMean(node, values), node.draw.sd);
  }

  const daily = problem.dag.nodes.filter((node) => node.repeat === "daily");
  const results = problem.dag.nodes.filter((node) => node.repeat === "result");

  for (let day = 0; day < days; day++) {
    for (const node of daily) {
      if (node.draw?.type !== "normal" || typeof node.draw.sd !== "number") {
        throw new Error(`node ${node.id} is not a normal draw`);
      }
      values[node.id] = drawNormal(drawnMean(node, values), node.draw.sd);
    }
    for (const node of results) {
      if (!node.option || !(node.option in totals)) {
        throw new Error(`result node ${node.id} is not tied to an option`);
      }
      let dayTotal = 0;
      for (const parent of parentIds(problem, node.id)) {
        if (!Number.isFinite(values[parent])) {
          throw new Error(`result node ${node.id} is missing ${parent}`);
        }
        dayTotal += values[parent];
      }
      totals[node.option] += dayTotal;
    }
  }

  return totals;
}

/** The p point of a sorted list, with a straight line between the two nearest runs. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] * (high - index) + sorted[high] * (index - low);
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Run the recipe as many times as the problem asks, then apply its rule:
 * among the options whose chance of falling short is at most the limit,
 * recommend the one with the higher typical result.
 */
export function solveCapstone(problem: CapstoneProblem): CapstoneAnswer {
  const runs = problem.scenario.params.runs;
  const samples: Record<string, number[]> = {};
  for (const candidate of problem.candidates) samples[candidate.id] = [];

  for (let run = 0; run < runs; run++) {
    const totals = simulateRun(problem);
    for (const candidate of problem.candidates) {
      samples[candidate.id].push(totals[candidate.id]);
    }
  }

  const outcomes: Record<string, OptionOutcome> = {};
  for (const candidate of problem.candidates) {
    const sorted = samples[candidate.id].slice().sort((a, b) => a - b);
    let short = 0;
    for (const value of sorted) {
      if (value < problem.limit.atLeast) short += 1;
    }
    outcomes[candidate.id] = {
      typical: percentile(sorted, 0.5),
      low: percentile(sorted, 0.05),
      high: percentile(sorted, 0.95),
      chanceShort: short / sorted.length,
    };
  }

  let betterAverageId = problem.candidates[0].id;
  for (const candidate of problem.candidates) {
    if (outcomes[candidate.id].typical > outcomes[betterAverageId].typical) {
      betterAverageId = candidate.id;
    }
  }

  const eligible = problem.candidates.filter(
    (candidate) => outcomes[candidate.id].chanceShort <= problem.limit.maxChance
  );
  let action = betterAverageId;
  if (eligible.length > 0) {
    action = eligible[0].id;
    for (const candidate of eligible) {
      if (outcomes[candidate.id].typical > outcomes[action].typical) action = candidate.id;
    }
  } else {
    action = problem.candidates[0].id;
    for (const candidate of problem.candidates) {
      const fewerShortfalls = outcomes[candidate.id].chanceShort < outcomes[action].chanceShort;
      const sameChanceHigherTypical =
        outcomes[candidate.id].chanceShort === outcomes[action].chanceShort &&
        outcomes[candidate.id].typical > outcomes[action].typical;
      if (fewerShortfalls || sameChanceHigherTypical) action = candidate.id;
    }
  }

  const others = problem.candidates.filter((candidate) => candidate.id !== action);
  let beats = 0;
  if (others.length === 1) {
    const other = others[0].id;
    for (let i = 0; i < runs; i++) {
      if (samples[action][i] > samples[other][i]) beats += 1;
    }
  }
  const chanceActionBeatsOther = runs === 0 ? 0 : beats / runs;
  const kind = action === betterAverageId ? "clear" : "tension";

  const chosen = problem.candidates.find((candidate) => candidate.id === action);
  const better = problem.candidates.find((candidate) => candidate.id === betterAverageId);
  const params = problem.scenario.params;
  const chosenOutcome = outcomes[action];
  const shortIn100 = Math.round(chosenOutcome.chanceShort * 100);
  const limitIn100 = Math.round(problem.limit.maxChance * 100);
  const reasoning =
    kind === "clear"
      ? `${chosen?.label ?? action} has the higher typical ${params.periodName}, about ${formatCount(chosenOutcome.typical)} ${params.unit}, and it falls short of ${formatCount(problem.limit.atLeast)} in about ${shortIn100} of 100 simulated ${params.periodName}s, inside the ${limitIn100} in 100 limit.`
      : `${better?.label ?? betterAverageId} has the higher typical ${params.periodName}, but it falls short of ${formatCount(problem.limit.atLeast)} too often. ${chosen?.label ?? action} stays inside the ${limitIn100} in 100 limit, with a typical ${params.periodName} of about ${formatCount(chosenOutcome.typical)} ${params.unit}.`;

  return {
    action,
    outcomes,
    chanceActionBeatsOther,
    betterAverageId,
    kind,
    reasoning,
  };
}
