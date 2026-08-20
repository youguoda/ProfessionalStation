import { NextResponse } from "next/server";
import { createWeeklyReview, listWeeklyReviews } from "@/lib/db/store";

export async function GET() {
  const reviews = await listWeeklyReviews();
  return NextResponse.json(reviews);
}

export async function POST(req: Request) {
  const body = await req.json();
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const checklist = body?.checklist && typeof body.checklist === "object" ? body.checklist : {};
  const review = await createWeeklyReview({ notes, checklist });
  return NextResponse.json(review, { status: 201 });
}
