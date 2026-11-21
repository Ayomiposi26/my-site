import { NextResponse } from "next/server";
import { saveLatest, type CandidateSummary } from "@/lib/simulator-store";

/**
 * Challenge 3 brain. Each posted game is Chapter 13's coin-flip investment:
 * a buy-in, a horizon, an up move, a down move, and a short list of stake
 * fractions. For every fraction we play the game 20,000 times and keep the
 * stake whose typical (median) investor finishes with the most money.
 *
 * The reply has to land inside the grader's wiggle room: the fraction exact,
 * the median within 5%, and the loss probability within 0.03. The fraction
 * is chosen from the simulated medians, so a memorized list cannot pass.
 */
export const maxDuration = 10;

/** Investors played for each candidate stake. */
const N_PATHS = 20_000;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Play `years` of the coin flip `N_PATHS` times at one stake.
 *
 * Each year the staked slice of wealth is multiplied by (1 + up) on heads
 * or (1 - down) on tails, and the unstaked slice is unchanged. That is the
 * same as multiplying the whole balance by (1 + up * fraction) or
 * (1 - down * fraction). Only the number of heads matters, so each investor
 * is stored as a head count.
 *
 * The median wealth is the balance on the path with half heads. With an even
 * horizon that path is a real head count, and with an odd horizon it sits
 * halfway between the two middle counts. The sample usually lands on that
 * same place; when the halfway rank falls on the crack between two counts,
 * the median is the geometric midpoint of those two balances.
 */
function simulateCandidate(
  fraction: number,
  up: number,
  down: number,
  years: number,
  buyIn: number
): CandidateSummary {
  const upFactor = 1 + up * fraction;
  const downFactor = 1 - down * fraction;
  const logUp = Math.log(upFactor);
  const logDown = Math.log(downFactor);
  const counts = new Uint32Array(years + 1);

  for (let i = 0; i < N_PATHS; i++) {
    let heads = 0;
    for (let year = 0; year < years; year++) {
      if (Math.random() < 0.5) heads += 1;
    }
    counts[heads] += 1;
  }

  // Log growth relative to the buy-in. Negative means the investor lost money.
  const logGrowth = (heads: number) => heads * logUp + (years - heads) * logDown;
  const wealth = (heads: number) => buyIn * Math.exp(logGrowth(heads));

  const order: number[] = [];
  for (let heads = 0; heads <= years; heads++) {
    if (counts[heads] > 0) order.push(heads);
  }
  order.sort((a, b) => logGrowth(a) - logGrowth(b) || a - b);

  const half = N_PATHS / 2;
  let cum = 0;
  let median = wealth(order[0]);
  for (let i = 0; i < order.length; i++) {
    const heads = order[i];
    const prev = cum;
    cum += counts[heads];
    if (prev < half && cum >= half) {
      const atom = counts[heads];
      const slack = Math.min(half - prev, cum - half);
      const here = wealth(heads);
      // A wide pile of identical balances means the typical path is that
      // head count. A pile that only just reaches the halfway rank means the
      // typical path sits between this count and its neighbor.
      if (slack > Math.max(50, 0.15 * atom)) {
        median = here;
      } else {
        const towardHigher = half - prev >= cum - half;
        const neighbor = towardHigher ? order[i + 1] : order[i - 1];
        median = neighbor === undefined ? here : Math.sqrt(here * wealth(neighbor));
      }
      break;
    }
  }

  let losses = 0;
  for (let heads = 0; heads <= years; heads++) {
    if (logGrowth(heads) < 0) losses += counts[heads];
  }

  const atPercentile = (p: number) => {
    const rank = Math.round(p * (N_PATHS - 1));
    let seen = 0;
    for (const heads of order) {
      seen += counts[heads];
      if (seen > rank) return wealth(heads);
    }
    return wealth(order[order.length - 1]);
  };

  return {
    fraction,
    p5: atPercentile(0.05),
    p25: atPercentile(0.25),
    median,
    p75: atPercentile(0.75),
    p95: atPercentile(0.95),
    probLoss: losses / N_PATHS,
  };
}

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export async function POST(req: Request) {
  const problem = await req.json().catch(() => null);
  if (!isRecord(problem)) {
    return badRequest("expected a JSON investment game");
  }
  if (problem.type !== "investment-game") {
    return badRequest('problem type must be "investment-game"');
  }

  const upPct = finiteNumber(problem.upPct);
  const downPct = finiteNumber(problem.downPct);
  const horizonYears = finiteNumber(problem.horizonYears);
  const buyIn = finiteNumber(problem.buyIn);
  const fractions = problem.candidateFractions;

  if (upPct === null || downPct === null || horizonYears === null || buyIn === null) {
    return badRequest("upPct, downPct, horizonYears, and buyIn must be finite numbers");
  }
  if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 300) {
    return badRequest("horizonYears must be a whole number of years from 1 to 300");
  }
  if (buyIn <= 0) {
    return badRequest("buyIn must be a positive number of dollars");
  }
  if (!Array.isArray(fractions) || fractions.length === 0 || fractions.length > 12) {
    return badRequest("candidateFractions must be a short non-empty list of stake fractions");
  }

  const up = upPct / 100;
  const down = downPct / 100;
  const candidates: CandidateSummary[] = [];

  for (const raw of fractions) {
    const fraction = finiteNumber(raw);
    if (fraction === null) {
      return badRequest("every candidate fraction must be a finite number");
    }
    const upFactor = 1 + up * fraction;
    const downFactor = 1 - down * fraction;
    if (upFactor <= 0 || downFactor <= 0) {
      return badRequest(
        `stake ${fraction} makes a year's multiplier non-positive, so the game is undefined`
      );
    }
    candidates.push(simulateCandidate(fraction, up, down, horizonYears, buyIn));
  }

  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.median > best.median) best = candidate;
  }

  const stakePct = Math.round(best.fraction * 100);
  const lossPct = Math.round(best.probLoss * 100);
  const answer = {
    recommendedFraction: best.fraction,
    medianFinalBalance: Math.round(best.median),
    probLoss: best.probLoss,
    reasoning: `Of the ${candidates.length} stakes simulated, staking ${stakePct}% each year left the typical investor with the most: about ${money(best.median)} after ${horizonYears} years, from a ${money(buyIn)} buy-in. ${lossPct}% of simulated investors still ended below the buy-in.`,
  };

  try {
    await saveLatest(problem, answer, candidates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not save the latest game";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(answer);
}
