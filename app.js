// app.js
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
require('dotenv').config()
const serverless = require('serverless-http')
const app = express()

// Global Middlewares
app.use(express.json())
app.use(cookieParser())
app.use(
  cors({
    origin: ['https://web-mcash.vercel.app', 'http://localhost:5173'],
    credentials: true
  })
)

// Logging Middleware
app.use((req, res, next) => {
  console.log('Request received:', req.method, req.url)
  next()
})

// Import and mount routes
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const adminRoutes = require('./routes/adminRoutes')
const transactionRoutes = require('./routes/transactionRoutes')
const agentRoutes = require('./routes/agentRoutes')
const rechargeRoutes = require('./routes/rechargeRoutes')

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/transaction', transactionRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/recharge', rechargeRoutes)

app.get('/', (req, res) => {
  res.send('mCash server is running')
})

// app.use("/.netlify/functions/app", router);
// module.exports.handler = serverless(app);
// Export the serverless handler
module.exports.handler = serverless(app)
module.exports = app;
