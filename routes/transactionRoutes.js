// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const client = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');

// Send Money (User)
router.post('/send-money', verifyToken, async (req, res) => {
  try {
    const { recipientMobile, amount } = req.body;
    const amountInt = parseInt(amount);
    const usersCollection = client.db('mcashDB').collection('users');
    const transactionsCollection = client.db('mcashDB').collection('transactions');
    const sender = await usersCollection.findOne({ email: req.decoded.email });
    if (!sender || sender.role !== 'user') {
      return res.status(403).send({ message: 'Only users can send money' });
    }
    if (amountInt < 50) {
      return res.status(400).send({ message: 'Minimum amount is 50 taka' });
    }
    const fee = amountInt > 100 ? 5 : 0;
    const totalDeduction = amountInt + fee;
    if (sender.balance < totalDeduction) {
      return res.status(400).send({ message: 'Insufficient funds' });
    }
    const recipient = await usersCollection.findOne({
      mobile: recipientMobile,
      role: 'user'
    });
    if (!recipient) {
      return res.status(400).send({ message: 'Recipient not found' });
    }
    await usersCollection.updateOne({ _id: sender._id }, { $inc: { balance: -totalDeduction } });
    await usersCollection.updateOne({ _id: recipient._id }, { $inc: { balance: amountInt } });
    // Add fee to Admin account if applicable
    await usersCollection.updateOne({ role: 'admin' }, { $inc: { balance: fee } });
    const transaction = {
      transactionId: uuidv4(),
      type: 'sendMoney',
      amountInt,
      fee,
      sender: sender._id,
      receiver: recipient._id,
      date: new Date(),
      details: `Sent ${amountInt} taka to ${recipient.mobile}`
    };
    await transactionsCollection.insertOne(transaction);
    res.send({ message: 'Successful', transaction });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Cash-Out (User)
router.post('/cash-out', verifyToken, async (req, res) => {
  try {
    const { amount, agentMobile, pin } = req.body;
    const amountInt = parseInt(amount);
    const usersCollection = client.db('mcashDB').collection('users');
    const transactionsCollection = client.db('mcashDB').collection('transactions');
    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (!user || user.role !== 'user') {
      return res.status(403).send({ message: 'Only users can cash out' });
    }
    const bcrypt = require('bcrypt');
    const pinMatch = await bcrypt.compare(pin, user.pin);
    if (!pinMatch) {
      return res.status(400).send({ message: 'Invalid PIN' });
    }
    const agent = await usersCollection.findOne({
      mobile: agentMobile,
      role: 'agent',
      approved: true
    });
    if (!agent) {
      return res.status(400).send({ message: 'Agent not found or not approved' });
    }
    const fee = amountInt * 0.015;
    const totalDeduction = amountInt + fee;
    if (user.balance < totalDeduction) {
      return res.status(400).send({ message: 'Insufficient funds' });
    }
    await usersCollection.updateOne({ _id: user._id }, { $inc: { balance: -totalDeduction } });
    const agentIncome = amountInt * 0.01;
    await usersCollection.updateOne({ _id: agent._id }, { $inc: { balance: amountInt, income: agentIncome } });
    const adminIncome = amountInt * 0.005;
    await usersCollection.updateOne({ role: 'admin' }, { $inc: { balance: adminIncome } });
    const transaction = {
      transactionId: uuidv4(),
      type: 'cashOut',
      amountInt,
      fee,
      sender: user._id,
      agent: agent._id,
      date: new Date(),
      details: `Cashed out ${amountInt} taka via agent ${agent.mobile}`
    };
    await transactionsCollection.insertOne(transaction);
    res.send({ message: 'Successful', transaction });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

module.exports = router;
