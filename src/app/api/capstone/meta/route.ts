import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "capstone",
    specVersion: "2",
    studentToken: process.env.SITE_TOKEN,
    domain: "staffing",
  });
}