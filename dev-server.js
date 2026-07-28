import express from 'express';
import handler from './api/admin-board-api.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const app = express();
app.use(express.json());

app.all('/api/admin-board-api', async (req, res) => {
  // Mock Vercel req/res
  try {
    await handler(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(3001, () => {
  console.log('Local API Server running on port 3001');
});
