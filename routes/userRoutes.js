// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const client = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');

// Get user profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const email = req.decoded.email;
    const usersCollection = client.db('mcashDB').collection('users');
    const result = await usersCollection.findOne({ email });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Get Balance API
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const email = req.decoded.email;
    const usersCollection = client.db('mcashDB').collection('users');
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).send({ message: 'User not found' });
    res.send({ balance: user.balance, income: user.income || 0 });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Transaction History (last 100 transactions)
router.get('/transaction/history', verifyToken, async (req, res) => {
  try {
    const email = req.decoded.email;
    const usersCollection = client.db('mcashDB').collection('users');
    const transactionsCollection = client.db('mcashDB').collection('transactions');
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).send({ message: 'User not found' });
    const transactions = await transactionsCollection
      .find({
        $or: [{ sender: user._id }, { receiver: user._id }, { agent: user._id }],
      })
      .sort({ date: -1 })
      .limit(100)
      .toArray();
    res.send({ transactions });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

module.exports = router;
