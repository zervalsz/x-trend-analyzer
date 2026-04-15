import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI!;
const dbName = process.env.DB_NAME || "trendhunter";

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export { clientPromise, dbName };