
import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing in .env");
}

const client = new MongoClient(uri);

let db;

export async function connectToMongoDB() {
  if (db) return db;

  await client.connect();

  db = client.db('parcelDB5');

  console.log("Successfully connected to MongoDB!");

  return db;
}

export async function disconnectFromMongoDB() {
  await client.close();
}
