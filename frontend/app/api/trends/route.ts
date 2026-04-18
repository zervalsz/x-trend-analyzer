import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(dbName);

    const trends = await db
      .collection("trends")
      .find({
        keywords: { $exists: true, $ne: [], $not: { $size: 0 } },
        summary: { $exists: true, $ne: "" },
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