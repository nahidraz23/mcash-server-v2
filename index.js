const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.port || 5300
const { MongoClient, ServerApiVersion } = require('mongodb')
const jwt = require('jsonwebtoken')

// Bycrypt
const bcrypt = require('bcrypt')
const saltRounds = 10

// middlewares
app.use(express.json())
app.use(cors())

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.73lbb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
})

async function run () {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db('mcashDB').collection('users')

    // User Register api
    app.post('/register', async (req, res) => {
      const { name, pin, nid, email, mobile, role, balance } = req.body
      const hashPin = bcrypt.hashSync(pin, saltRounds)
      const user = { name, pin: hashPin, nid, email, mobile, role, balance }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    // jwt
    // app.post('/jwt', async (req, res) => {
    //     const user = req.body;

    // })

    //User Login api
    app.post('/login', async (req, res) => {
      const { email, pin } = req.body
      const token = jwt.sign({email}, process.env.ACCESS_TOKEN_SECRET , { expiresIn: "1h"});

      const query = { email: email }
      const result = await usersCollection.findOne(query)

      if (!result) {
        return res.status(400).json({ message: 'Invalid Credentials' })
      }

      const decodedPin = await bcrypt.compare(pin, result.pin)
      if (decodedPin) {
        return res
        .cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'none'
        })
        .send({ message: 'Success', email})
      } else {
        return res.send('Failed')
      }
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

// server
app.get('/', (req, res) => {
  res.send('mCash server is running')
})

app.listen(port, () => {
  console.log(`mCash server is running on port: ${port}`)
})
