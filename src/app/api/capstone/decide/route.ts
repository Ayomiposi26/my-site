import { NextResponse } from "next/server";
import type { CapstoneAnswer, CapstoneProbe, DagNode, Row } from "@/lib/capstone-helpers";
import { solveCapstone, type CapstoneProblem } from "@/lib/capstone-simulate";
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

/** The fields simulateRun() reads, taken from an already validated probe. */
function simulationProblem(probe: CapstoneProbe): CapstoneProblem {
  const periodLength = probe.scenario.params.periodLength;
  const runs = probe.scenario.params.runs;
  if (typeof periodLength !== "number" || typeof runs !== "number") {
    throw new Error("scenario.params.periodLength and runs must be numbers");
  }
  return {
    type: probe.type,
    domain: probe.domain,
    candidates: probe.candidates,
    scenario: {
      params: {
        reader: String(probe.scenario.params.reader ?? "the reader"),
        unit: String(probe.scenario.params.unit ?? "units"),
        periodName: String(probe.scenario.params.periodName ?? "period"),
        periodLength,
        periodUnit: String(probe.scenario.params.periodUnit ?? "days"),
        runs,
      },
    },
    limit: { atLeast: probe.limit.atLeast, maxChance: probe.limit.maxChance },
    dag: {
      nodes: probe.dag.nodes.map((node) => {
        const parsed: CapstoneProblem["dag"]["nodes"][number] = {
          id: node.id,
          repeat: node.repeat === "weekly" ? "daily" : node.repeat,
        };
        if (node.option) parsed.option = node.option;
        if (node.compute) parsed.compute = node.compute;
        if (node.draw) parsed.draw = node.draw;
        return parsed;
      }),
      edges: probe.dag.edges,
    },
  };
}

function parseHistory(value: unknown): Row[] | null {
  if (!Array.isArray(value)) return null;
  const rows: Row[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const parsed: Row = {};
    for (const [key, cell] of Object.entries(row)) {
      if (typeof cell === "string") parsed[key] = cell;
      else if (typeof cell === "number" && Number.isFinite(cell)) parsed[key] = cell;
      else return null;
    }
    rows.push(parsed);
  }
  return rows;
}

function parseProblem(body: unknown): CapstoneProbe | NextResponse {
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
    if (typeof node.plain !== "string") {
      return badRequest(`node ${node.id} needs a plain description`);
    }
    if (
      node.repeat !== "once" &&
      node.repeat !== "daily" &&
      node.repeat !== "weekly" &&
      node.repeat !== "result"
    ) {
      return badRequest(`node ${node.id} has an unknown repeat`);
    }
    const parsed: DagNode = { id: node.id, plain: node.plain, repeat: node.repeat };
    if (typeof node.option === "string") parsed.option = node.option;
    if (typeof node.compute === "string") parsed.compute = node.compute;
    if (node.basedOn !== undefined) {
      const basedOn = finiteNumber(node.basedOn);
      if (basedOn === null) return badRequest(`node ${node.id} has a basedOn that is not a number`);
      parsed.basedOn = basedOn;
    }
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

  const history = parseHistory(body.history);
  if (!history) return badRequest("history must be a list of rows");
  if (typeof body.probeId !== "string") return badRequest("problem needs a probeId");
  const scenario = body.scenario;
  if (typeof scenario.narrative !== "string") return badRequest("scenario.narrative must be text");
  if (typeof scenario.decisionRule !== "string") return badRequest("scenario.decisionRule must be text");
  if (!isRecord(body.limit) || typeof body.limit.plain !== "string") {
    return badRequest("limit.plain must be text");
  }

  const scenarioParams: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") scenarioParams[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) scenarioParams[key] = value;
  }
  scenarioParams.periodLength = periodLength;
  scenarioParams.runs = runs;

  return {
    probeId: body.probeId,
    type: "capstone-decision",
    domain: "staffing",
    yours: body.yours === true,
    scenario: {
      narrative: scenario.narrative,
      params: scenarioParams,
      decisionRule: scenario.decisionRule,
    },
    history,
    candidates,
    limit: { atLeast, maxChance, plain: body.limit.plain },
    dag: { nodes, edges },
  };
}

export async function POST(req: Request) {
  const probe = parseProblem(await req.json().catch(() => null));
  if (probe instanceof NextResponse) return probe;

  let answer;
  try {
    answer = solveCapstone(simulationProblem(probe));
  } catch (err) {
    const message = err instanceof Error ? err.message : "the recipe could not be simulated";
    return badRequest(message);
  }

  const saved: CapstoneAnswer = {
    action: answer.action,
    outcomes: answer.outcomes,
    chanceActionBeatsOther: answer.chanceActionBeatsOther,
    reasoning: answer.reasoning,
  };

  // Only your own problem is saved, so your report always shows it.
  // Practice problems are answered and then discarded.
  if (probe.yours === true) {
    try {
      await saveLatest(probe, saved);
    } catch (err) {
      return NextResponse.json(
        { error: `could not save your problem: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(answer);
}
