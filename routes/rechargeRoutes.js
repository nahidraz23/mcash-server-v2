// routes/rechargeRoutes.js
const express = require('express');
const router = express.Router();
const client = require('../config/db');
const verifyToken = require('../middlewares/verifyToken');

// Get pending recharge requests (Admin)
router.get('/', verifyToken, async (req, res) => {
  try {
    const usersCollection = client.db('mcashDB').collection('users');
    const rechargeRequestsCollection = client.db('mcashDB').collection('rechargeRequests');
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

// Process recharge request (Admin)
router.put('/:requestId', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { approve } = req.body;
    const usersCollection = client.db('mcashDB').collection('users');
    const rechargeRequestsCollection = client.db('mcashDB').collection('rechargeRequests');
    const admin = await usersCollection.findOne({ email: req.decoded.email });
    if (!admin || admin.role !== 'admin') {
      return res.status(403).send({ message: 'Access denied' });
    }
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

module.exports = router;
