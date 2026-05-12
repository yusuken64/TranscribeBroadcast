const express = require('express');
const { getTranscripts } = require('../services/database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { from, to, limit } = req.query;

    const transcripts = await getTranscripts({
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      limit: limit ? Number(limit) : 100,
    });

    res.json(transcripts);
  } catch (error) {
    console.error('Failed to retrieve transcripts:', error);

    res.status(500).json({
      error: 'Failed to retrieve transcripts',
    });
  }
});

module.exports = router;