import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectToMongoDB } from "./config/mongodb.js";
import { ObjectId } from "mongodb";
import Stripe from "stripe";


const stripe = new Stripe(process.env.PAYMENT_GATEWAY_KEY);


const app = express();

app.use(express.json());


// CORS configuration
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

let db;


app.post('/users',async(req,res) => {
  try{
    const email = req.body.email;
    const userExists = await db.collection("users").findOne({email})
    if(userExists){
      // update last log in
      return res.status(200).send({message:'User already exists',inserted:false})
    }
    const user = req.body;
    const result = await db.collection('users').insertOne(user);
    res.send(result)
  }catch(error){
    console.error(error)
  }
})


// get parcel 
app.get("/parcels",async(req,res) => {
    try{
        const userEmail = req.query.email;
        const query = userEmail ? {created_by:userEmail} : {};
        const options = {
            sort:{createdAt: -1},
        }
        const parcels = await db.collection('parcels').find(query,options).toArray();
        res.send(parcels)
    }catch(error){
        console.error(error)
        res.status(500).send({message:'Failed to get parcels'})
    }
})

app.get("/parcels/:id",async(req,res) => {
  try{
    const id = req.params.id
    const parcel = await db.collection('parcels').findOne({_id:new ObjectId(id)})
    if(!parcel){
      return res.status(404).send({message:'Parcel not found'})
    }
    res.send(parcel);
  }catch(error){
    console.error(error);
    res.status(500).send({message:'Failed to fetch parcel'})
  }
})

app.post("/parcels",async(req,res) => {
    try{
        const newParcel = req.body;
        const result = await db.collection('parcels').insertOne(newParcel);
        res.status(201).send(result);
    }catch(error){
        console.error(error);
        res.status(500).send({message:'Failed to create parcel'})
    }
})


app.delete('/parcels/:id',async(req,res) => {
    try{
        const id = req.params.id;
        const result = await db.collection('parcels').deleteOne({_id:new ObjectId(id)});

        if(result.deletedCount === 0){
            return res.status(404).send({message:'Parcel not found'})
        }

        res.send({message:'Parcel deleted successfully'})
    }catch(error){
        console.error(error);
        res.status(500).send({message:'Failed to delete parcel'})
    }
})

app.post('/tracking',async(req,res) => {
  try{
    const {tracking_id,parcel_id,status,message,updated_by=''} = req.body;
    const log = {
      tracking_id,
      parcel_id : parcel_id ? new ObjectId(parcel_id) : undefined,
      status,
      message,
      time:new Date(),
      updated_by
    };
    const result = await db.collection('tracking').insertOne(log);
    res.send({success:true,insertedId:result.insertedId})
  }catch(error){
    res.status(500).send({message:"tracking post failed"})
  }
})


app.get('/payments',async(req,res) => {
  try{
    const userEmail = req.query.email;
    const query = userEmail ? {email:userEmail} : {};
    const options = {sort:{paid_at : -1}}
    const payments = await db.collection('payments').find(query,options).toArray();
    res.send(payments);
  }catch(error){
    res.status(500).send({message:'Failed to get payments'})
  }
})

app.post('/payments',async(req,res) => {
  try{
    const {parcelId,email,amount,paymentMethod,transactionId} = req.body;
    const updateResult = await db.collection('parcels').updateOne(
      {_id:new ObjectId(parcelId)},
      {
        $set:{
          payment_status:'paid'
        }
      }
    );
    if(updateResult.modifiedCount === 0){
      return res.status(404).send({message:'Parcel not found or already paid'})
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
      message:'Payment recorded and parcel marked as paid',
      insertedId:paymentResult.insertedId,
    })

  }catch(error){
    res.status(500).send({message:'payments post failed'})
  }
})


app.post('/create-payment-intent',async(req,res) => {
  const {amountInCents} = req.body
  try{
    const paymentIntent = await stripe.paymentIntents.create({
      amount:amountInCents,
      currency:'usd',
    });
    res.json({clientSecret:paymentIntent.client_secret})
  }catch(error){
    console.error(error)
    res.status(500).json({error:error.message})
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