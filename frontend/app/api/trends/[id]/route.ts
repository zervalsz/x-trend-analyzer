import { NextResponse } from "next/server";
import { clientPromise, dbName } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const client = await clientPromise;
    const db = client.db(dbName);

    const trend = await db.collection("trends").findOne({
      _id: new ObjectId(id),
    });
    if (!trend) {
      return NextResponse.json({ error: "Trend not found" }, { status: 404 });
    }

    const topicDetails = await Promise.all(
      trend.topic_ids.map(async (tid: string) => {
        const topic = await db.collection("topics").findOne({
          _id: new ObjectId(tid),
        });
        if (!topic) return null;

        const samplePosts = await db
          .collection("posts")
          .find({ cluster_id: tid })
          .sort({ likes: -1 })
          .limit(5)
          .toArray();

        return {
          _id: topic._id.toString(),
          date: topic.date,
          keywords: topic.keywords,
          summary: topic.summary,
          size: topic.size,
          posts: samplePosts.map((p) => ({
            post_id: p.post_id,
            text: p.text,
            author: p.author,
            post_url: p.post_url ?? null,
            source: p.source ?? "x",
            likes: p.likes ?? 0,
            retweets: p.retweets ?? 0,
            replies: p.replies ?? 0,
            views: p.views ?? 0,
          })),
        };
      })
    );

    return NextResponse.json({
      ...trend,
      _id: trend._id.toString(),
      topics: topicDetails.filter(Boolean),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch trend" }, { status: 500 });
  }
}