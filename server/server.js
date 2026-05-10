const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let currentWsClients = new Set();
let currentStream = null;
let isListening = false;
let ffmpegProcess = null;

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  currentWsClients.add(ws);

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    currentWsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcastMessage(speaker, text) {
  const message = JSON.stringify({ speaker, text, timestamp: new Date().toISOString() });
  currentWsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function startListeningToStream(url) {
  console.log(`Starting FFmpeg for stream: ${url}`);
  broadcastMessage('System', `Connecting to stream: ${url}`);

  // Spawn FFmpeg process
  ffmpegProcess = spawn(ffmpegPath, [
    '-i', url,
    '-f', 'wav',
    '-ac', '1',
    '-ar', '16000',
    'pipe:1'
  ]);

  let bytesReceived = 0;

  // Handle FFmpeg stdout (audio data)
  ffmpegProcess.stdout.on('data', (chunk) => {
    if (!isListening) {
      ffmpegProcess.kill();
      return;
    }

    bytesReceived += chunk.length;

    // Log every 100KB received
    if (bytesReceived % (100 * 1024) < chunk.length) {
      console.log(`Stream: ${(bytesReceived / 1024).toFixed(1)} KB received`);
      broadcastMessage('Transcriber', `[Receiving audio data: ${(bytesReceived / 1024).toFixed(1)} KB]`);
    }

    // TODO: Send audio chunk to transcription service here
    // Example: sendToTranscriptionService(chunk);
  });

  // Handle FFmpeg stderr (for logging/debugging)
  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log('FFmpeg stderr:', output);
    }
  });

  // Handle FFmpeg process close/exit
  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
    if (isListening) {
      broadcastMessage('System', `Stream ended (FFmpeg exit code: ${code})`);
      isListening = false;
    }
    ffmpegProcess = null;
  });

  ffmpegProcess.on('error', (error) => {
    console.error('FFmpeg process error:', error.message);
    broadcastMessage('System', `FFmpeg error: ${error.message}`);
    isListening = false;
    ffmpegProcess = null;
  });

  // Log successful start
  console.log('FFmpeg process started');
  broadcastMessage('System', 'Stream connected via FFmpeg');
}

app.post('/api/stream/start', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Stream URL is required' });
  }

  currentStream = url;
  isListening = true;

  console.log(`Starting to listen to stream: ${url}`);
  broadcastMessage('System', `Connected to stream: ${url}`);

  // Start listening to actual audio stream
  startListeningToStream(url);

  res.json({ success: true, message: 'Stream listening started', url });
});

app.post('/api/stream/stop', (req, res) => {
  isListening = false;
  currentStream = null;

  // Kill the FFmpeg process
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }

  console.log('Stopped listening to stream');
  broadcastMessage('System', 'Stream stopped');

  res.json({ success: true, message: 'Stream listening stopped' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
