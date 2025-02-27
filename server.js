// server.js
const app = require('./api');
const port = process.env.PORT || 5100;

app.listen(port, () => {
  console.log(`mCash server is running on port: ${port}`);
});