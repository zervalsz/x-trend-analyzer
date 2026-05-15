import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "7");
  const top = parseInt(searchParams.get("top") ?? "5");

  try {
    const client = await clientPromise;
    const db = client.db(dbName);

    // Build topic_id → { trend_id, trend_status } lookup
    const allTrends = await db
      .collection("trends")
      .find({}, { projection: { _id: 1, topic_ids: 1, status: 1 } })
      .toArray();

    const topicToTrend: Record<string, { trend_id: string; trend_status: string }> = {};
    for (const trend of allTrends) {
      for (const tid of trend.topic_ids ?? []) {
        topicToTrend[tid] = {
          trend_id: trend._id.toString(),
          trend_status: trend.status ?? "emerging",
        };
      }
    }

    // Anchor to most recent date that has summarized topics (not real today)
    const newestSummarized = await db
      .collection("topics")
      .findOne({ summary: { $exists: true, $ne: "" } }, { sort: { date: -1 } });

    if (!newestSummarized) return NextResponse.json([]);

    const anchor = new Date(newestSummarized.date);
    const cutoff = new Date(anchor);
    cutoff.setDate(cutoff.getDate() - (days - 1));

    const topics = await db
      .collection("topics")
      .find({ date: { $gte: cutoff, $lte: anchor }, summary: { $exists: true, $ne: "" } })
      .sort({ date: -1, size: -1 })
      .toArray();

    // Group by date string, keep top N per day
    const byDate: Record<string, object[]> = {};
    for (const topic of topics) {
      const dateKey = (topic.date as Date).toISOString().slice(0, 10);
      if (!byDate[dateKey]) byDate[dateKey] = [];
      if (byDate[dateKey].length < top) {
        const tid = topic._id.toString();
        byDate[dateKey].push({
          _id: tid,
          keywords: topic.keywords ?? [],
          summary: topic.summary ?? "",
          size: topic.size ?? 0,
          ...(topicToTrend[tid] ?? { trend_id: null, trend_status: "emerging" }),
        });
      }
    }

    // Return as sorted array (newest first)
    const result = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, topics]) => ({ date, topics }));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch daily hot topics" }, { status: 500 });
  }
}
