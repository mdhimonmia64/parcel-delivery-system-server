import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectToMongoDB } from "./config/mongodb.js";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import serviceAccount from "./firebase-admin-key.json" with {
  type: "json",
};

const stripe = new Stripe(process.env.PAYMENT_GATEWAY_KEY);


const app = express();
app.use(express.json());
const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
    credential: cert(serviceAccount),
  });

const adminAuth = getAuth(firebaseApp);




// CORS configuration
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

let db;

// custom middlewares
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  // verify the token
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(403).send({ message: 'forbidden access' })
  }
}

app.get('/users/search', async (req, res) => {
  try {
    const emailQuery = req.query.email;
    if (!emailQuery) {
      return res.status(400).send({ message: "Missing email query" });
    }
    const regex = new RegExp(emailQuery, 'i'); // Case-insensitive
    const users = await db.collection('users').find({ email: { $regex: regex } }).limit(10).toArray();
    res.send(users)
  } catch (error) {
    res.status(500).send({ message: "Error searching users" })
  }
})

app.get('/users/:email/role', async (req, res) => {
  try {
    const email = req.params.email;
    if (!email) {
      return res.status(400).send({ message: 'Email is required' });
    }
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).send({ message: "user not found" })
    }
    res.send({ role: user.role || 'user' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to get role' })
  }
})

app.post('/users', async (req, res) => {
  try {
    const email = req.body.email;
    const userExists = await db.collection("users").findOne({ email })
    if (userExists) {
      // update last log in
      return res.status(200).send({ message: 'User already exists', inserted: false })
    }
    const user = req.body;
    const result = await db.collection('users').insertOne(user);
    res.send(result)
  } catch (error) {
    console.error(error)
  }
})

app.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!["admin", "user"].includes(role)) {
    return res.status(400).send({ message: "Invalid role" })
  }
  try {
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );
    res.send({ message: `User role updated to ${role}`, result })
  } catch (error) {
    res.status(500).send({ message: "Failed to update user role" })
  }
})


// get parcel 
app.get("/parcels", verifyFBToken, async (req, res) => {
  try {
    const userEmail = req.query.email;
    const query = userEmail ? { created_by: userEmail } : {};
    const options = {
      sort: { createdAt: -1 },
    }
    const parcels = await db.collection('parcels').find(query, options).toArray();
    res.send(parcels)
  } catch (error) {
    console.error(error)
    res.status(500).send({ message: 'Failed to get parcels' })
  }
})

app.get("/parcels/:id", verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id
    const parcel = await db.collection('parcels').findOne({ _id: new ObjectId(id) })
    if (!parcel) {
      return res.status(404).send({ message: 'Parcel not found' })
    }
    res.send(parcel);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to fetch parcel' })
  }
})

app.post("/parcels", async (req, res) => {
  try {
    const newParcel = req.body;
    const result = await db.collection('parcels').insertOne(newParcel);
    res.status(201).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to create parcel' })
  }
})


app.delete('/parcels/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.collection('parcels').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: 'Parcel not found' })
    }

    res.send({ message: 'Parcel deleted successfully' })
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to delete parcel' })
  }
})

app.post('/riders', async (req, res) => {
  try {
    const rider = req.body;
    const result = await db.collection('riders').insertOne(rider);
    res.send(result)
  } catch (error) {
    res.status(500).send({ message: 'Failed to riders posts' })
  }
})

app.get('/riders/pending', async (req, res) => {
  try {
    const pendingRiders = await db.collection('riders').find({ status: "pending" }).toArray();
    res.send(pendingRiders)
  } catch (error) {
    res.status(500).send({ message: "Failed to load pending riders" });
  }
})

app.get('/riders/active', async (req, res) => {
  try {
    const result = await db.collection('riders')
      .find({ status: "active" })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load active riders" });
  }
})

app.get('/riders/deactivated', async (req, res) => {
  try {
    const deactivatedRiders = await db.collection('riders')
      .find({ status: "deactivated" })
      .toArray();

    res.send(deactivatedRiders);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to load deactivated riders"
    });
  }
});

app.patch('/riders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, email } = req.body;
  try {
    const result = await db.collection('riders').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (status === 'active') {
      const userQuery = { email };
      const userUpdateDoc = {
        $set: {
          role: 'rider'
        }
      };
      const roleResult = await db.collection('users').updateOne(userQuery, userUpdateDoc);
      console.log(roleResult.modifiedCount)
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update rider status" });
  }
})

app.post('/tracking', async (req, res) => {
  try {
    const { tracking_id, parcel_id, status, message, updated_by = '' } = req.body;
    const log = {
      tracking_id,
      parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
      status,
      message,
      time: new Date(),
      updated_by
    };
    const result = await db.collection('tracking').insertOne(log);
    res.send({ success: true, insertedId: result.insertedId })
  } catch (error) {
    res.status(500).send({ message: "tracking post failed" })
  }
})


app.get('/payments', verifyFBToken, async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (req.decoded.email !== userEmail) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    const query = userEmail ? { email: userEmail } : {};
    const options = { sort: { paid_at: -1 } }
    const payments = await db.collection('payments').find(query, options).toArray();
    res.send(payments);
  } catch (error) {
    res.status(500).send({ message: 'Failed to get payments' })
  }
})

app.post('/payments', async (req, res) => {
  try {
    const { parcelId, email, amount, paymentMethod, transactionId } = req.body;
    const updateResult = await db.collection('parcels').updateOne(
      { _id: new ObjectId(parcelId) },
      {
        $set: {
          payment_status: 'paid'
        }
      }
    );
    if (updateResult.modifiedCount === 0) {
      return res.status(404).send({ message: 'Parcel not found or already paid' })
    }

    const paymentDoc = {
      parcelId,
      email,
      amount,
      paymentMethod,
      transactionId,
      paid_at_string: new Date().toISOString(),
      paid_at: new Date()
    };

    const paymentResult = await db.collection('payments').insertOne(paymentDoc);

    res.status(201).send({
      message: 'Payment recorded and parcel marked as paid',
      insertedId: paymentResult.insertedId,
    })

  } catch (error) {
    res.status(500).send({ message: 'payments post failed' })
  }
})


app.post('/create-payment-intent', async (req, res) => {
  const { amountInCents } = req.body
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
    });
    res.json({ clientSecret: paymentIntent.client_secret })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message })
  }
})


app.get("/", (req, res) => {
  res.send("Server is running!");
});

async function startServer() {
  try {
    db = await connectToMongoDB();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();