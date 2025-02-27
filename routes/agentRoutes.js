// routes/agentRoutes.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const client = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');
const bcrypt = require('bcrypt');

// Cash-In (via Agent)
router.post('/cash-in', verifyToken, async (req, res) => {
  try {
    const { userMobile, amount, agentPin } = req.body;
    const amountInt = parseInt(amount);
    if (amountInt <= 0) {
      return res.status(400).send({ message: 'Invalid amount' });
    }
    const usersCollection = client.db('mcashDB').collection('users');
    const transactionsCollection = client.db('mcashDB').collection('transactions');
    const agent = await usersCollection.findOne({ email: req.decoded.email });
    if (!agent || agent.role !== 'agent') {
      return res.status(403).send({ message: 'Only agents can perform cash in transactions' });
    }
    const agentPinMatch = await bcrypt.compare(agentPin, agent.pin);
    if (!agentPinMatch) {
      return res.status(400).send({ message: 'Invalid agent PIN' });
    }
    if (agent.balance < amountInt) {
      return res.status(400).send({ message: 'Insufficient funds in agent account' });
    }
    const user = await usersCollection.findOne({ mobile: userMobile, role: 'user' });
    if (!user) {
      return res.status(400).send({ message: 'User not found' });
    }
    await usersCollection.updateOne({ _id: agent._id }, { $inc: { balance: -amountInt } });
    await usersCollection.updateOne({ _id: user._id }, { $inc: { balance: amountInt } });
    const transaction = {
      transactionId: uuidv4(),
      type: 'cashIn',
      amountInt,
      agent: agent._id,
      user: user._id,
      date: new Date(),
      details: `Agent ${agent.mobile} transferred ${amountInt} taka to user ${user.mobile}`
    };
    await transactionsCollection.insertOne(transaction);
    res.send({ message: 'Cash-in successful', transaction });
  } catch (error) {
    console.error('Cash-in error:', error);
    res.status(500).send({ message: 'Server error during cash-in transaction' });
  }
});

// Request Balance Recharge (Agent)
router.post('/request-money', verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const amountInt = parseFloat(amount);
    if (!amountInt || amountInt <= 0) {
      return res.status(400).send({ message: 'Invalid amount' });
    }
    const usersCollection = client.db('mcashDB').collection('users');
    const rechargeRequestsCollection = client.db('mcashDB').collection('rechargeRequests');
    const agent = await usersCollection.findOne({ email: req.decoded.email });
    if (!agent || agent.role !== 'agent') {
      return res.status(403).send({ message: 'Only agents can request a balance recharge' });
    }
    const rechargeRequest = {
      requestId: uuidv4(),
      agentId: agent._id,
      amountInt,
      status: 'pending',
      createdAt: new Date()
    };
    await rechargeRequestsCollection.insertOne(rechargeRequest);
    res.status(200).send({ message: 'Request submitted', rechargeRequest });
  } catch (error) {
    console.error('Error processing agent request:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

module.exports = router;
