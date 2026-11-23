import { NextResponse } from "next/server";
import type { CapstoneProbe } from "@/lib/capstone-helpers";
import { solveCapstone, type CapstoneProblem, type DagNode } from "@/lib/capstone-simulate";
import { saveLatest } from "@/lib/capstone-store";

/**
 * Challenge 5 brain. Each posted problem is one staffing recipe: two shops,
 * a quarter of working days, and a shortfall limit. The numbers come from
 * the problem itself. simulateRun() plays one quarter; this route plays it
 * as many times as the recipe asks, then keeps the option the recipe's rule
 * selects.
 */
export const maxDuration = 10;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseProblem(body: unknown): CapstoneProblem | NextResponse {
  if (!isRecord(body)) return badRequest("expected a JSON capstone problem");
  if (body.type !== "capstone-decision") {
    return badRequest('problem type must be "capstone-decision"');
  }
  if (body.domain !== "staffing") {
    return badRequest('this service answers the staffing domain');
  }
  if (!isRecord(body.scenario) || !isRecord(body.scenario.params)) {
    return badRequest("problem needs scenario.params");
  }
  if (!isRecord(body.limit)) return badRequest("problem needs a limit");
  if (!isRecord(body.dag) || !Array.isArray(body.dag.nodes) || !Array.isArray(body.dag.edges)) {
    return badRequest("problem needs a dag with nodes and edges");
  }
  if (!Array.isArray(body.candidates) || body.candidates.length !== 2) {
    return badRequest("staffing problems need exactly two candidates");
  }

  const params = body.scenario.params;
  const periodLength = finiteNumber(params.periodLength);
  const runs = finiteNumber(params.runs);
  const atLeast = finiteNumber(body.limit.atLeast);
  const maxChance = finiteNumber(body.limit.maxChance);
  if (periodLength === null || !Number.isInteger(periodLength) || periodLength < 1) {
    return badRequest("scenario.params.periodLength must be a positive whole number");
  }
  if (runs === null || !Number.isInteger(runs) || runs < 1) {
    return badRequest("scenario.params.runs must be a positive whole number");
  }
  if (atLeast === null || maxChance === null || maxChance < 0 || maxChance > 1) {
    return badRequest("limit.atLeast and limit.maxChance must be finite numbers");
  }

  const candidates = [];
  for (const candidate of body.candidates) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.label !== "string") {
      return badRequest("each candidate needs an id and a label");
    }
    candidates.push({ id: candidate.id, label: candidate.label });
  }

  const nodes: DagNode[] = [];
  for (const node of body.dag.nodes) {
    if (!isRecord(node) || typeof node.id !== "string") {
      return badRequest("each dag node needs an id");
    }
    if (node.repeat !== "once" && node.repeat !== "daily" && node.repeat !== "result") {
      return badRequest(`node ${node.id} has an unknown repeat`);
    }
    const parsed: DagNode = { id: node.id, repeat: node.repeat };
    if (typeof node.option === "string") parsed.option = node.option;
    if (typeof node.compute === "string") parsed.compute = node.compute;
    if (node.repeat !== "result") {
      if (!isRecord(node.draw)) return badRequest(`node ${node.id} needs a draw`);
      const sd = finiteNumber(node.draw.sd);
      const mean = node.draw.mean;
      const meanOk = typeof mean === "number" ? Number.isFinite(mean) : typeof mean === "string";
      if (node.draw.type !== "normal" || sd === null || sd < 0 || !meanOk) {
        return badRequest(`node ${node.id} must be a normal draw with a mean and a spread`);
      }
      parsed.draw = { type: "normal", mean: mean as number | string, sd };
    }
    nodes.push(parsed);
  }

  const edges: [string, string][] = [];
  for (const edge of body.dag.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || typeof edge[0] !== "string" || typeof edge[1] !== "string") {
      return badRequest("each dag edge must be a pair of node ids");
    }
    edges.push([edge[0], edge[1]]);
  }

  return {
    type: "capstone-decision",
    domain: "staffing",
    candidates,
    scenario: {
      params: {
        reader: typeof params.reader === "string" ? params.reader : "the reader",
        unit: typeof params.unit === "string" ? params.unit : "units",
        periodName: typeof params.periodName === "string" ? params.periodName : "period",
        periodLength,
        periodUnit: typeof params.periodUnit === "string" ? params.periodUnit : "days",
        runs,
      },
    },
    limit: { atLeast, maxChance },
    dag: { nodes, edges },
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseProblem(body);
  if (parsed instanceof NextResponse) return parsed;

  let answer;
  try {
    answer = solveCapstone(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "the recipe could not be simulated";
    return badRequest(message);
  }

  // Only your own problem is saved, so your report always shows it.
  // Practice problems are answered and then discarded.
  if (isRecord(body) && body.yours === true) {
    try {
      await saveLatest(body as CapstoneProbe, answer);
    } catch (err) {
      return NextResponse.json(
        { error: `could not save your problem: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(answer);
}
