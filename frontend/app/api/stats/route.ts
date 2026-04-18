import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(dbName);

    const [
      totalPosts,
      embeddedPosts,
      totalTopics,
      totalTrends,
      activeTrends,
      latest,
    ] = await Promise.all([
      db.collection("posts").countDocuments(),
      db.collection("posts").countDocuments({ embedded_at: { $exists: true } }),
      db.collection("topics").countDocuments(),
      db.collection("trends").countDocuments(),
      db.collection("trends").countDocuments({
        keywords: { $exists: true, $ne: [] },
        summary: { $exists: true, $ne: "" },
      }),
      db.collection("posts").find({}).sort({ scraped_at: -1 }).limit(1).toArray(),
    ]);

    return NextResponse.json({
      totalPosts,
      embeddedPosts,
      totalTopics,
      totalTrends,
      activeTrends,
      lastScraped: latest[0]?.scraped_at ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}