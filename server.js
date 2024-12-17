const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configure your DB connection (adjust credentials as needed)
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'messagingdb',
  password: 'mysecretpassword',
  port: 5432,
});

// ========== USERS ROUTES ==========

// POST /users - create a new user (register)
app.post('/users', async (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO users (first_name, last_name) VALUES ($1, $2) RETURNING id, first_name, last_name',
      [firstName, lastName]
    );
    const user = result.rows[0];
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /users?firstName=...&lastName=...
// Return the user that matches given names
app.get('/users', async (req, res) => {
  const { firstName, lastName } = req.query;
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Provide firstName and lastName to find a user.' });
  }
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE first_name = $1 AND last_name = $2',
      [firstName, lastName]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Optionally: GET /users/:id to retrieve user by ID
app.get('/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ========== MESSAGES ROUTES ==========

// POST /messages - send a message
// Body: { sender_id, recipient_id OR (firstName, lastName), text }
app.post('/messages', async (req, res) => {
  const { sender_id, recipient_id, firstName, lastName, text } = req.body;
  if (!sender_id || !text) {
    return res.status(400).json({ error: 'sender_id and text are required.' });
  }

  let finalRecipientId = recipient_id;
  
  try {
    // If recipient_id not provided, try to find user by name
    if (!finalRecipientId && (firstName && lastName)) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE first_name = $1 AND last_name = $2',
        [firstName, lastName]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Recipient not found by name.' });
      }
      finalRecipientId = userResult.rows[0].id;
    }

    if (!finalRecipientId) {
      return res.status(400).json({ error: 'recipient_id or (firstName, lastName) required.' });
    }

    const result = await pool.query(
      'INSERT INTO messages (sender_id, recipient_id, text) VALUES ($1, $2, $3) RETURNING id, sender_id, recipient_id, text, timestamp',
      [sender_id, finalRecipientId, text]
    );
    const message = result.rows[0];
    res.status(201).json(message);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /messages?sender_id=...&recipient_id=...
// Return messages filtered by sender and/or recipient
app.get('/messages', async (req, res) => {
  const { user_id, recipient_id } = req.query;
  let query = `
    SELECT m.id, m.sender_id, m.recipient_id, m.text, m.timestamp,
           s.first_name AS sender_first, s.last_name AS sender_last,
           r.first_name AS recipient_first, r.last_name AS recipient_last
    FROM messages m
    JOIN users s ON m.sender_id = s.id
    JOIN users r ON m.recipient_id = r.id
  `;

  const values = [];
  const conditions = [];

  if (user_id && recipient_id) {
    // Show full conversation between user_id and recipient_id in both directions
    conditions.push(`((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))`);
    values.push(user_id, recipient_id);
  } else if (user_id) {
    // Show all messages involving this user
    conditions.push(`(m.sender_id = $1 OR m.recipient_id = $1)`);
    values.push(user_id);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY m.timestamp ASC';

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
