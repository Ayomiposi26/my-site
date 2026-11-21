import { NextResponse } from "next/server";
import { saveLatest, type ProblemType } from "@/lib/reasoning-store";

/** Keep each decision inside the challenge's time budget. */
export const maxDuration = 10;

const PROBLEM_TYPES = ["syllogism", "plausibility", "bernoulli"] as const;

const SYLLOGISM_FORMS = {
  A: { verdict: "valid" },
  "not-B": { verdict: "valid" },
  B: { verdict: "invalid", fallacy: "affirming the consequent" },
  "not-A": { verdict: "invalid", fallacy: "denying the antecedent" },
} as const;

type SyllogismAsserts = keyof typeof SYLLOGISM_FORMS;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function solveSyllogism(problem: Record<string, unknown>) {
  const observation = problem.observation;
  if (!isRecord(observation)) {
    return badRequest("syllogism problem needs an observation object");
  }
  const asserts = observation.asserts;
  if (asserts !== "A" && asserts !== "not-B" && asserts !== "B" && asserts !== "not-A") {
    return badRequest(
      'syllogism observation.asserts must be "A", "not-B", "B", or "not-A"'
    );
  }
  return { ...SYLLOGISM_FORMS[asserts as SyllogismAsserts] };
}

function solvePlausibility(problem: Record<string, unknown>) {
  const baseRate = finiteNumber(problem.baseRate);
  const hitRate = finiteNumber(problem.hitRate);
  const falseAlarmRate = finiteNumber(problem.falseAlarmRate);
  if (baseRate === null || hitRate === null || falseAlarmRate === null) {
    return badRequest(
      "plausibility problem needs finite numeric baseRate, hitRate, and falseAlarmRate"
    );
  }

  const trueFlags = baseRate * hitRate;
  const falseFlags = (1 - baseRate) * falseAlarmRate;
  const flagged = trueFlags + falseFlags;
  if (!Number.isFinite(flagged) || flagged === 0) {
    return badRequest("plausibility rates do not define a posterior");
  }
  const posterior = trueFlags / flagged;
  if (!Number.isFinite(posterior)) {
    return badRequest("plausibility rates do not define a posterior");
  }
  return { posterior };
}

function solveBernoulli(problem: Record<string, unknown>) {
  const theta = finiteNumber(problem.theta);
  const payoffs = problem.payoffs;
  if (theta === null || !isRecord(payoffs)) {
    return badRequest("bernoulli problem needs a finite theta and a payoffs object");
  }
  const onSuccess = finiteNumber(payoffs.onSuccess);
  const onFailure = finiteNumber(payoffs.onFailure);
  if (onSuccess === null || onFailure === null) {
    return badRequest("bernoulli payoffs.onSuccess and payoffs.onFailure must be finite numbers");
  }
  if (problem.probabilityOf !== 0 && problem.probabilityOf !== 1) {
    return badRequest("bernoulli probabilityOf must be 0 or 1");
  }

  return {
    support: [0, 1],
    expectedValue: theta * onSuccess + (1 - theta) * onFailure,
    probabilityStatement: problem.probabilityOf === 1 ? theta : 1 - theta,
  };
}

export async function POST(req: Request) {
  const problem = await req.json().catch(() => null);
  if (!isRecord(problem) || typeof problem.type !== "string") {
    return badRequest("expected a JSON problem with a `type` field");
  }
  if (!PROBLEM_TYPES.includes(problem.type as ProblemType)) {
    return badRequest('problem type must be "syllogism", "plausibility", or "bernoulli"');
  }

  const answer =
    problem.type === "syllogism"
      ? solveSyllogism(problem)
      : problem.type === "plausibility"
        ? solvePlausibility(problem)
        : solveBernoulli(problem);

  if (answer instanceof NextResponse) return answer;

  try {
    await saveLatest(problem.type as ProblemType, problem, answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not save the latest answer";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(answer);
}
