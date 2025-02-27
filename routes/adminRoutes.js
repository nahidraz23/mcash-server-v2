// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const client = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');

// Get all users and agents (admin)
router.get('/users', verifyToken, async (req, res) => {
  try {
    const usersCollection = client.db('mcashDB').collection('users');
    const admin = await usersCollection.findOne({ email: req.decoded.email });
    if (!admin || admin.role !== 'admin') {
      return res.status(403).send({ message: 'Access denied' });
    }
    const users = await usersCollection.find({ role: { $in: ['user', 'agent'] } }).toArray();
    res.send({ users });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// All Transaction History (admin)
router.get('/transactionhistory', verifyToken, async (req, res) => {
  try {
    const usersCollection = client.db('mcashDB').collection('users');
    const transactionsCollection = client.db('mcashDB').collection('transactions');
    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (!user) return res.status(404).send({ message: 'User not found' });
    const transactions = await transactionsCollection.find().toArray();
    res.send({ transactions });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Get pending agent approvals
router.get('/agent-approvals', verifyToken, async (req, res) => {
  try {
    const usersCollection = client.db('mcashDB').collection('users');
    const admin = await usersCollection.findOne({ email: req.decoded.email });
    if (!admin || admin.role !== 'admin') {
      return res.status(403).send({ message: 'Access denied' });
    }
    const agents = await usersCollection.find({ role: 'agent', approved: false }).toArray();
    res.send({ agents });
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

// Approve/Reject agent
router.put('/agent-approve/:email', verifyToken, async (req, res) => {
  try {
    const usersCollection = client.db('mcashDB').collection('users');
    const admin = await usersCollection.findOne({ email: req.decoded.email });
    if (!admin || admin.role !== 'admin') {
      return res.status(403).send({ message: 'Access denied' });
    }
    const agentEmail = req.params.email;
    const { approve } = req.body;
    if (approve) {
      await usersCollection.updateOne({ email: agentEmail }, { $set: { approved: true } });
      res.send({ message: 'Agent approved' });
    } else {
      await usersCollection.deleteOne({ email: agentEmail });
      res.send({ message: 'Agent rejected and removed' });
    }
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

module.exports = router;
