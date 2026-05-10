const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const WebSocket = require('ws');
const { nodewhisper } = require('nodejs-whisper');

const app = express();
const PORT = process.env.PORT || 5000;
const SEGMENTS_DIR = path.join(__dirname, 'segments');
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny';
let segmentIndex = 0;

if (!fs.existsSync(SEGMENTS_DIR)) {
  fs.mkdirSync(SEGMENTS_DIR, { recursive: true });
}

app.use(express.json());
app.use('/segments', express.static(SEGMENTS_DIR));

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let currentWsClients = new Set();
let currentStream = null;
let isListening = false;
let ffmpegProcess = null;

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const FRAME_MS = 30;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const FRAME_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE;
const ENERGY_THRESHOLD = 400;
const MIN_SPEECH_FRAMES = 2;
const SILENCE_TO_CUT_MS = 900;
const SILENCE_FRAMES_TO_CUT = Math.ceil(SILENCE_TO_CUT_MS / FRAME_MS);
const PRE_SPEECH_BUFFER_MS = 300;
const PRE_SPEECH_FRAMES = Math.ceil(PRE_SPEECH_BUFFER_MS / FRAME_MS);

let audioFrameBuffer = Buffer.alloc(0);
let preSpeechBuffer = [];
let activeSegmentBuffer = [];
let segmentStartTime = null;
let silenceFrameCount = 0;
let speechFrameCount = 0;
let inSegment = false;

function getFrameRms(frameBuffer) {
  const sampleCount = frameBuffer.length / BYTES_PER_SAMPLE;
  let sumSq = 0;

  for (let offset = 0; offset < frameBuffer.length; offset += BYTES_PER_SAMPLE) {
    const sample = frameBuffer.readInt16LE(offset);
    sumSq += sample * sample;
  }

  return Math.sqrt(sumSq / sampleCount);
}

function pushPreSpeechFrame(frame) {
  preSpeechBuffer.push(frame);
  if (preSpeechBuffer.length > PRE_SPEECH_FRAMES) {
    preSpeechBuffer.shift();
  }
}

function startSegment(frame) {
  inSegment = true;
  segmentStartTime = new Date().toISOString();
  silenceFrameCount = 0;
  activeSegmentBuffer = [];

  if (preSpeechBuffer.length > 0) {
    activeSegmentBuffer.push(...preSpeechBuffer);
  }

  activeSegmentBuffer.push(frame);
  //broadcastMessage('System', `Segment started at ${segmentStartTime}`);
}

function createWavHeader(dataLength) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;

  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // audio format PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function writeSegmentWav(segmentBuffer) {
  const filename = `segment-${Date.now()}-${segmentIndex++}.wav`;
  const filepath = path.join(SEGMENTS_DIR, filename);
  const header = createWavHeader(segmentBuffer.length);
  const wavBuffer = Buffer.concat([header, segmentBuffer]);

  fs.writeFileSync(filepath, wavBuffer);
  console.log(`WAV segment written: ${filepath}`);
  // broadcastMessage('System', `Saved segment file: ${filename}`, {
  //   segmentUrl: `/segments/${filename}`,
  //   filename,
  // });

  return filepath;
}

async function transcribeSegment(wavPath) {
  try {
    console.log(`Starting transcription of ${path.basename(wavPath)} with model: ${WHISPER_MODEL}`);
    const result = await nodewhisper(wavPath, {
      modelName: 'base.en',

      whisperOptions: {
        // cleaner output
        outputInText: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,

        // remove timestamps in transcript
        noTimestamps: true,
        nt: true,              // <-- THIS is the real flag
        np: true,              // optional: no prints (cleaner output)
        word_timestamps: false,

        // better segmentation
        splitOnWord: true,

        // improve dispatch/radio audio handling
        vad: true,

        // optional tuning
        wordTimestamps: false,
        translateToEnglish: false,
      },

      removeWavFileAfterTranscription: false,

      logger: {
        log: (...args) => console.log(...args),
        debug: (...args) => console.debug(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
      },
    });

    const raw = (result || '').trim();

    if (!raw) {

      const now = new Date().toLocaleString();

      broadcastMessage(
        `[${now}] (0.0s)\n[No speech detected]`
      );

    } else {

      // Match:
      // [00:00:00.000 --> 00:00:02.080]
      // transcript text

      const match = raw.match(
        /\[(\d+):(\d+):([\d.]+)\s*-->\s*(\d+):(\d+):([\d.]+)\]\s*([\s\S]*)/
      );

      let durationSeconds = 0;
      let transcript = raw;

      if (match) {

        const startHours = parseInt(match[1]);
        const startMinutes = parseInt(match[2]);
        const startSeconds = parseFloat(match[3]);

        const endHours = parseInt(match[4]);
        const endMinutes = parseInt(match[5]);
        const endSeconds = parseFloat(match[6]);

        const startTotal =
          startHours * 3600 +
          startMinutes * 60 +
          startSeconds;

        const endTotal =
          endHours * 3600 +
          endMinutes * 60 +
          endSeconds;

        durationSeconds = endTotal - startTotal;

        transcript = match[7].trim();
      }

      const now = new Date().toLocaleString();

      const timestamp =
        `[${now}] (${durationSeconds.toFixed(1)}s)`;

      if (transcript && transcript.trim() !== '[BLANK_AUDIO]') {
        broadcastMessage(timestamp, transcript.trim());
      }
    }
  } catch (error) {
    console.error(`Transcription error:`, error);
    broadcastMessage('System', `Transcription failed: ${error.message}`);
  }
}

function finishSegment() {
  if (!inSegment || activeSegmentBuffer.length === 0) {
    return;
  }

  const segmentBuffer = Buffer.concat(activeSegmentBuffer);
  const durationSeconds = segmentBuffer.length / (SAMPLE_RATE * BYTES_PER_SAMPLE);
  const segmentEndTime = new Date().toISOString();

  //broadcastMessage('System', `Segment ended at ${segmentEndTime} (${durationSeconds.toFixed(2)}s)`);
  console.log(`Segment ready: ${durationSeconds.toFixed(2)}s, ${segmentBuffer.length} bytes`);

  const wavPath = writeSegmentWav(segmentBuffer);
  transcribeSegment(wavPath);

  activeSegmentBuffer = [];
  inSegment = false;
  silenceFrameCount = 0;
  speechFrameCount = 0;
  preSpeechBuffer = [];
}

function processAudioChunk(chunk) {
  audioFrameBuffer = Buffer.concat([audioFrameBuffer, chunk]);

  while (audioFrameBuffer.length >= FRAME_BYTES) {
    const frame = audioFrameBuffer.slice(0, FRAME_BYTES);
    audioFrameBuffer = audioFrameBuffer.slice(FRAME_BYTES);
    const rms = getFrameRms(frame);
    const isSpeech = rms >= ENERGY_THRESHOLD;

    if (isSpeech) {
      speechFrameCount += 1;
      silenceFrameCount = 0;

      if (!inSegment && speechFrameCount >= MIN_SPEECH_FRAMES) {
        startSegment(frame);
      } else if (inSegment) {
        activeSegmentBuffer.push(frame);
      }

      pushPreSpeechFrame(frame);
    } else {
      speechFrameCount = 0;

      if (inSegment) {
        activeSegmentBuffer.push(frame);
        silenceFrameCount += 1;

        if (silenceFrameCount > SILENCE_FRAMES_TO_CUT) {
          finishSegment();
        }
      } else {
        pushPreSpeechFrame(frame);
      }
    }
  }
}

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

function broadcastMessage(speaker, text, extra = {}) {
  const message = JSON.stringify({ speaker, text, timestamp: new Date().toISOString(), ...extra });
  currentWsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function startListeningToStream(url) {
  console.log(`Starting FFmpeg for stream: ${url}`);
  broadcastMessage('System', `Connecting to stream: ${url}`);

  // Spawn FFmpeg process and produce raw PCM audio for frame-based VAD
  ffmpegProcess = spawn(ffmpegPath, [
    '-i', url,
    '-f', 's16le',
    '-ac', '1',
    '-ar', `${SAMPLE_RATE}`,
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
      //broadcastMessage('Transcriber', `[Receiving audio data: ${(bytesReceived / 1024).toFixed(1)} KB]`);
    }

    processAudioChunk(chunk);
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
    if (inSegment) {
      finishSegment();
    }

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

  if (inSegment) {
    finishSegment();
  }

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
