import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/store";

export async function GET() {
  const db = await getDb();
  return NextResponse.json(db);
}
