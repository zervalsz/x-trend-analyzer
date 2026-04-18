import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";

export async function GET(
  request: Request,
  context: { params: Promise<{ step: string }> }
) {
  try {
    const { step } = await context.params;
    const client = await clientPromise;
    const db = client.db(dbName);

    if (step === "scrape") {
      const recentPosts = await db
        .collection("posts")
        .find({})
        .sort({ scraped_at: -1 })
        .limit(10)
        .toArray();
      const byDate = await db.collection("posts").aggregate([
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $limit: 14 },
      ]).toArray();
      return NextResponse.json({
        recentPosts: recentPosts.map((p) => ({
          post_id: p.post_id,
          text: p.text,
          author: p.author,
          scraped_at: p.scraped_at,
          likes: p.likes ?? 0,
          retweets: p.retweets ?? 0,
        })),
        byDate,
      });
    }

    if (step === "embed") {
      const total = await db.collection("posts").countDocuments();
      const embedded = await db.collection("posts").countDocuments({ embedded_at: { $exists: true } });
      const pending = total - embedded;
      return NextResponse.json({ total, embedded, pending });
    }

    if (step === "cluster") {
      const topics = await db
        .collection("topics")
        .find({})
        .sort({ date: -1 })
        .limit(30)
        .toArray();
      return NextResponse.json({
        topics: topics.map((t) => ({
          _id: t._id.toString(),
          date: t.date,
          keywords: t.keywords,
          summary: t.summary,
          size: t.size,
        })),
      });
    }

    if (step === "link") {
      const trends = await db.collection("trends").find({}).toArray();
      return NextResponse.json({
        trends: trends.map((t) => ({
          _id: t._id.toString(),
          topic_count: t.topic_ids?.length ?? 0,
          status: t.status,
          keywords: t.keywords,
          created_at: t.created_at,
        })),
      });
    }

    if (step === "score") {
      const trends = await db
        .collection("trends")
        .find({ "metrics.avg_engagement": { $exists: true } })
        .toArray();
      return NextResponse.json({
        trends: trends.map((t) => ({
          _id: t._id.toString(),
          status: t.status,
          keywords: t.keywords,
          metrics: t.metrics,
        })),
      });
    }

    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch pipeline data" }, { status: 500 });
  }
}