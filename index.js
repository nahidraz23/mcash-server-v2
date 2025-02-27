const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.port || 5300
const { MongoClient, ServerApiVersion } = require('mongodb')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid')

// Bycrypt
const bcrypt = require('bcrypt')
const saltRounds = 10

// middlewares
app.use(express.json())
app.use(cookieParser())
app.use(cors(
  {
    origin: ['http://localhost:5173'],
    credentials: true
  }
));

// Custom middlewares
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  // console.log('Value of token in middleware:', token)
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized' })
  }
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    req.decoded = decoded
    next()
  } catch (err) {
    return res.status(401).send({ message: 'Unauthorized' })
  }
}

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
    const transactionsCollection = client
      .db('mcashDB')
      .collection('transactions')
    const rechargeRequestsCollection = client
      .db('mcashDB')
      .collection('rechargeRequests')

    // User get api
    app.get('/user', verifyToken, async (req, res) => {
      const email = req.decoded.email
      const query = { email: email }
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    // Admin: Get all users and agents
    app.get('/admin/users', verifyToken, async (req, res) => {
      const admin = await usersCollection.findOne({ email: req.decoded.email })
      if (!admin || admin.role !== 'admin') {
        return res.status(403).send({ message: 'Access denied' })
      }
      const users = await usersCollection
        .find({ role: { $in: ['user', 'agent'] } })
        .toArray()
      res.send({ users })
    })

    // User Register api
    app.post('/register', async (req, res) => {
      const { name, pin, nid, email, mobile, role, balance } = req.body
  
      const existing = await usersCollection.findOne({
        $or: [{ email }, { mobile }, { nid }]
      })
      if (existing) {
        return res.status(400).send({ message: 'User already exists' })
      }
      const hashPin = bcrypt.hashSync(pin, saltRounds)
      let userBalance = balance || 0
      let approved = true
      if (role === 'user') {
        userBalance = 40 
      } else if (role === 'agent') {
        userBalance = 100000
        approved = false
      }
      const user = {
        name,
        pin: hashPin,
        nid,
        email,
        mobile,
        role,
        balance: userBalance,
        approved,
        isBlocked: false,
        lastLoggedInDevice: null,
        createdAt: new Date()
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    //User Login api
    app.post('/login', async (req, res) => {
      const { email, pin } = req.body

      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })

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
            // sameSite: 'strict'
          })
          .send({ message: 'Success', email })
      } else {
        return res.send('Failed')
      }
    })

    // Protected: Get Balance API
    app.get('/balance', verifyToken, async (req, res) => {
      const email = req.decoded.email
      const user = await usersCollection.findOne({ email })
      if (!user) return res.status(404).send({ message: 'User not found' })
      res.send({ balance: user.balance, income: user.income || 0 })
    })

    // Transaction History (Last 100 transactions)
    app.get('/transaction/history', verifyToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.decoded.email })
      if (!user) return res.status(404).send({ message: 'User not found' })
      const transactions = await transactionsCollection
        .find({
          $or: [
            { sender: user._id },
            { receiver: user._id },
            { agent: user._id }
          ]
        })
        .sort({ date: -1 })
        .limit(100)
        .toArray()
      res.send({ transactions })
    })

    // Admin: All Transaction History
    app.get('/admin/transactionhistory', verifyToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.decoded.email })
      if (!user) return res.status(404).send({ message: 'User not found' })
      const transactions = await transactionsCollection.find().toArray()
      console.log(transactions)
      res.send({ transactions })
    })

    // Transaction: Send Money (User)
    app.post('/transaction/send-money', verifyToken, async (req, res) => {
      const { recipientMobile, amount } = req.body
      const amountInt = parseInt(amount)
      const sender = await usersCollection.findOne({ email: req.decoded.email })
      if (!sender || sender.role !== 'user') {
        return res.status(403).send({ message: 'Only users can send money' })
      }
      if (amountInt < 50) {
        return res.status(400).send({ message: 'Minimum amount is 50 taka' })
      }
      const fee = amountInt > 100 ? 5 : 0
      const totalDeduction = amountInt + fee
      if (sender.balance < totalDeduction) {
        return res.status(400).send({ message: 'Insufficient funds' })
      }
      const recipient = await usersCollection.findOne({
        mobile: recipientMobile,
        role: 'user'
      })

      if (!recipient) {
        return res.status(400).send({ message: 'Recipient not found' })
      }
      await usersCollection.updateOne(
        { _id: sender._id },
        { $inc: { balance: -totalDeduction } }
      )
      await usersCollection.updateOne(
        { _id: recipient._id },
        { $inc: { balance: amountInt } }
      )
      // Add fee to Admin account if applicable
      await usersCollection.updateOne(
        { role: 'admin' },
        { $inc: { balance: fee } }
      )
      const transaction = {
        transactionId: uuidv4(),
        type: 'sendMoney',
        amountInt,
        fee,
        sender: sender._id,
        receiver: recipient._id,
        date: new Date(),
        details: `Sent ${amountInt} taka to ${recipient.mobile}`
      }
      await transactionsCollection.insertOne(transaction)
      res.send({ message: 'Successful', transaction })
    })

    // Transaction: Cash-In (via Agent)
    app.post('/transaction/cash-in', verifyToken, async (req, res) => {
      try {
        const { userMobile, amount, agentPin } = req.body

        let amountInt = parseInt(amount)
        if (amountInt <= 0) {
          return res.status(400).send({ message: 'Invalid amount' })
        }

        const agent = await usersCollection.findOne({
          email: req.decoded.email
        })
        if (!agent || agent.role !== 'agent') {
          return res
            .status(403)
            .send({ message: 'Only agents can perform cash in transactions' })
        }

        const agentPinMatch = await bcrypt.compare(agentPin, agent.pin)
        if (!agentPinMatch) {
          return res.status(400).send({ message: 'Invalid agent PIN' })
        }

        if (agent.balance < amountInt) {
          return res
            .status(400)
            .send({ message: 'Insufficient funds in agent account' })
        }

        const user = await usersCollection.findOne({
          mobile: userMobile,
          role: 'user'
        })
        if (!user) {
          return res.status(400).send({ message: 'User not found' })
        }

        await usersCollection.updateOne(
          { _id: agent._id },
          { $inc: { balance: -amountInt } }
        )

        await usersCollection.updateOne(
          { _id: user._id },
          { $inc: { balance: amountInt } }
        )

        const transaction = {
          transactionId: uuidv4(),
          type: 'cashIn',
          amountInt,
          agent: agent._id,
          user: user._id,
          date: new Date(),
          details: `Agent ${agent.mobile} transferred ${amountInt} taka to user ${user.mobile}`
        }

        await transactionsCollection.insertOne(transaction)

        res.send({ message: 'Cash-in successful', transaction })
      } catch (error) {
        console.error('Cash-in error:', error)
        res
          .status(500)
          .send({ message: 'Server error during cash-in transaction' })
      }
    })

    // Transaction: Cash-Out (User)
    app.post('/transaction/cash-out', verifyToken, async (req, res) => {
      const { amount, agentMobile, pin } = req.body
      const amountInt = parseInt(amount)
      const user = await usersCollection.findOne({ email: req.decoded.email })
      if (!user || user.role !== 'user') {
        return res.status(403).send({ message: 'Only users can cash out' })
      }
      const pinMatch = await bcrypt.compare(pin, user.pin)
      if (!pinMatch) {
        return res.status(400).send({ message: 'Invalid PIN' })
      }
      const agent = await usersCollection.findOne({
        mobile: agentMobile,
        role: 'agent',
        approved: true
      })
      if (!agent) {
        return res
          .status(400)
          .send({ message: 'Agent not found or not approved' })
      }
      const fee = amountInt * 0.015
      const totalDeduction = amountInt + fee
      if (user.balance < totalDeduction) {
        return res.status(400).send({ message: 'Insufficient funds' })
      }
      await usersCollection.updateOne(
        { _id: user._id },
        { $inc: { balance: -totalDeduction } }
      )
      const agentIncome = amount * 0.01
      await usersCollection.updateOne(
        { _id: agent._id },
        { $inc: { balance: amountInt, income: agentIncome } }
      )
      const adminIncome = amountInt * 0.005
      await usersCollection.updateOne(
        { role: 'admin' },
        { $inc: { balance: adminIncome } }
      )
      const transaction = {
        transactionId: uuidv4(),
        type: 'cashOut',
        amountInt,
        fee,
        sender: user._id,
        agent: agent._id,
        date: new Date(),
        details: `Cashed out ${amountInt} taka via agent ${agent.mobile}`
      }
      await transactionsCollection.insertOne(transaction)
      res.send({ message: 'Successful', transaction })
    })

    // Admin: Get pending agent approvals
    app.get('/admin/agent-approvals', verifyToken, async (req, res) => {
      const admin = await usersCollection.findOne({ email: req.decoded.email })
      if (!admin || admin.role !== 'admin') {
        return res.status(403).send({ message: 'Access denied' })
      }
      const agents = await usersCollection
        .find({ role: 'agent', approved: false })
        .toArray()
      res.send({ agents })
    })

    // Admin: Approve or Reject an agent
    app.put('/admin/agent-approve/:email', verifyToken, async (req, res) => {
      const admin = await usersCollection.findOne({ email: req.decoded.email })
      if (!admin || admin.role !== 'admin') {
        return res.status(403).send({ message: 'Access denied' })
      }
      const agentEmail = req.params.email
      const { approve } = req.body // true or false
      if (approve) {
        await usersCollection.updateOne(
          { email: agentEmail },
          { $set: { approved: true } }
        )
        res.send({ message: 'Agent approved' })
      } else {
        await usersCollection.deleteOne({ email: agentEmail })
        res.send({ message: 'Agent rejected and removed' })
      }
    })

    app.get('/admin/recharge-requests', verifyToken, async (req, res) => {
      try {
        const admin = await usersCollection.findOne({ email: req.decoded.email });
        if (!admin || admin.role !== 'admin') {
          return res.status(403).send({ message: 'Access denied' });
        }

        const requests = await rechargeRequestsCollection.find({ status: 'pending' }).toArray();
        res.send({ requests });
      } catch (error) {
        console.error('Error fetching recharge requests:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Agent: Request Balance Recharge
    app.post('/agent/request-money', verifyToken, async (req, res) => {
      try {
        const { amount } = req.body
        const amountInt = parseFloat(amount)
        if (!amountInt || amountInt <= 0) {
          return res.status(400).send({ message: 'Invalid amount' })
        }

        const agent = await usersCollection.findOne({
          email: req.decoded.email
        })
        if (!agent || agent.role !== 'agent') {
          return res
            .status(403)
            .send({ message: 'Only agents can request a balance recharge' })
        }

        const rechargeRequest = {
          requestId: uuidv4(),
          agentId: agent._id,
          amountInt,
          status: 'pending',
          createdAt: new Date()
        }

        await rechargeRequestsCollection.insertOne(rechargeRequest)

        res.status(200).send({ message: 'Request submitted', rechargeRequest })
      } catch (error) {
        console.error('Error processing agent request:', error)
        res.status(500).send({ message: 'Internal server error' })
      }
    })

    app.put('/admin/recharge-requests/:requestId', verifyToken, async (req, res) => {
      try {
        const admin = await usersCollection.findOne({ email: req.decoded.email });
        if (!admin || admin.role !== 'admin') {
          return res.status(403).send({ message: 'Access denied' });
        }
    
        const { requestId } = req.params;
        const { approve } = req.body;
    
        const request = await rechargeRequestsCollection.findOne({ requestId });
        if (!request) {
          return res.status(404).send({ message: 'Request not found' });
        }
        if (request.status !== 'pending') {
          return res.status(400).send({ message: 'Request already processed' });
        }
    
        const newStatus = approve ? 'approved' : 'rejected';
        await rechargeRequestsCollection.updateOne(
          { requestId },
          { $set: { status: newStatus, processedAt: new Date() } }
        );
    
        if (approve) {
          await usersCollection.updateOne(
            { _id: request.agentId },
            { $inc: { balance: request.amountInt } }
          );
        }
        res.send({ message: `Request ${newStatus}` });
      } catch (error) {
        console.error('Error processing recharge request:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Log out api
    app.post('/logout', async (req, res) => {
      res.clearCookie('token')
      res.status(200).json({ message: 'Success' })
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
