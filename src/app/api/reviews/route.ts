import { NextResponse } from "next/server";
import {
  createWeeklyReview,
  getWeeklyReviewDraft,
  listWeeklyReviews,
  setWeeklyReviewDraft,
} from "@/lib/db/store";

export async function GET() {
  const reviews = await listWeeklyReviews();
  const draft = await getWeeklyReviewDraft();
  return NextResponse.json({ reviews, draft });
}

export async function POST(req: Request) {
  const body = await req.json();
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const checklist = body?.checklist && typeof body.checklist === "object" ? body.checklist : {};
  const review = await createWeeklyReview({ notes, checklist });
  return NextResponse.json(review, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const checklist =
    body?.checklist && typeof body.checklist === "object" ? body.checklist : {};
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const draft = await setWeeklyReviewDraft({ checklist, notes });
  return NextResponse.json(draft);
}
