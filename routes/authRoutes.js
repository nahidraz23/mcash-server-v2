// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const client = require('../config/db');
const saltRounds = 10;

// User Register
router.post('/register', async (req, res) => {
  try {
    const { name, pin, nid, email, mobile, role, balance } = req.body;
    const usersCollection = client.db('mcashDB').collection('users');
    const existing = await usersCollection.findOne({
      $or: [{ email }, { mobile }, { nid }],
    });
    if (existing) {
      return res.status(400).send({ message: 'User already exists' });
    }
    const hashPin = bcrypt.hashSync(pin, saltRounds);
    let userBalance = balance || 0;
    let approved = true;
    if (role === 'user') {
      userBalance = 40;
    } else if (role === 'agent') {
      userBalance = 100000;
      approved = false;
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
      createdAt: new Date(),
    };
    const result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Server error' });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, pin } = req.body;
    console.log(email, pin);
    const usersCollection = client.db('mcashDB').collection('users');
    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: '1h',
    });
    const result = await usersCollection.findOne({ email });
    if (!result) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }
    const decodedPin = await bcrypt.compare(pin, result.pin);
    if (decodedPin) {
      return res
        .cookie('token', token, {
          httpOnly: true,
          secure: false, // For development, you might want to set this to false
          // sameSite: 'none',
        })
        .send({ message: 'Success', email })
    } else {
      return res.send('Failed');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Server error' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Success' });
});

module.exports = router;
