import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(dbName);

    // Find the most recent topic date across all trends to use as "now"
    const newest = await db
      .collection("trends")
      .findOne({ last_topic_date: { $exists: true } }, { sort: { last_topic_date: -1 } });

    const cutoff = newest?.last_topic_date
      ? new Date(new Date(newest.last_topic_date).getTime() - 3 * 24 * 60 * 60 * 1000)
      : new Date(0);

    const trends = await db
      .collection("trends")
      .find({
        keywords: { $exists: true, $ne: [], $not: { $size: 0 } },
        summary: { $exists: true, $ne: "" },
        last_topic_date: { $gte: cutoff },
      })
      .sort({ "metrics.avg_engagement": -1 })
      .toArray();

    const serialized = trends.map((t) => ({
      ...t,
      _id: t._id.toString(),
    }));

    return NextResponse.json(serialized);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}