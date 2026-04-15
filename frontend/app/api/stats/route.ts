import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(dbName);
    const total = await db.collection("posts").countDocuments();
    const latest = await db.collection("posts").find({}).sort({ scraped_at: -1 }).limit(1).toArray();
    const lastScraped = latest[0]?.scraped_at ?? null;
    return NextResponse.json({ total, lastScraped });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}