import { NextResponse } from "next/server";

/**
 * Challenge 4 handshake. The grader asks who lives here before it sends
 * audits. The token is the same SITE_TOKEN /api/health echoes.
 */
export async function GET() {
  return NextResponse.json({
    service: "causality",
    specVersion: "1",
    studentToken: process.env.SITE_TOKEN,
  });
}
