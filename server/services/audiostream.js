const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

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

function createAudioStreamService({ segmentsDir, broadcastMessage, transcribeSegment }) {
  if (!fs.existsSync(segmentsDir)) {
    fs.mkdirSync(segmentsDir, { recursive: true });
  }

  let ffmpegProcess = null;
  let audioFrameBuffer = Buffer.alloc(0);
  let preSpeechBuffer = [];
  let activeSegmentBuffer = [];
  let segmentIndex = 0;
  let segmentStartTime = null;
  let silenceFrameCount = 0;
  let speechFrameCount = 0;
  let inSegment = false;
  let isListening = false;

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
  }

  function createWavHeader(dataLength) {
    const header = Buffer.alloc(44);
    const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
    const blockAlign = CHANNELS * BYTES_PER_SAMPLE;

    header.write('RIFF', 0, 4, 'ascii');
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8, 4, 'ascii');
    header.write('fmt ', 12, 4, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
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
    const filepath = path.join(segmentsDir, filename);
    const header = createWavHeader(segmentBuffer.length);
    const wavBuffer = Buffer.concat([header, segmentBuffer]);

    fs.writeFileSync(filepath, wavBuffer);
    console.log(`WAV segment written: ${filepath}`);
    return filepath;
  }

  async function finishSegment() {
    if (!inSegment || activeSegmentBuffer.length === 0) {
      return;
    }

    const segmentBuffer = Buffer.concat(activeSegmentBuffer);
    const durationSeconds = segmentBuffer.length / (SAMPLE_RATE * BYTES_PER_SAMPLE);
    const segmentEndTime = new Date().toISOString();

    console.log(`Segment ready: ${durationSeconds.toFixed(2)}s, ${segmentBuffer.length} bytes`);

    const wavPath = writeSegmentWav(segmentBuffer);
    await transcribeSegment(wavPath, broadcastMessage);

    activeSegmentBuffer = [];
    inSegment = false;
    silenceFrameCount = 0;
    speechFrameCount = 0;
    preSpeechBuffer = [];

    broadcastMessage('System', `Segment finished at ${segmentEndTime} (${durationSeconds.toFixed(2)}s)`, {
      segmentUrl: `/segments/${path.basename(wavPath)}`,
    });
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

  function startListening(url) {
    if (isListening) {
      return;
    }

    isListening = true;
    broadcastMessage('System', `Connecting to stream: ${url}`);
    console.log(`Starting FFmpeg for stream: ${url}`);

    ffmpegProcess = spawn(ffmpegPath, [
      '-i', url,
      '-f', 's16le',
      '-ac', '1',
      '-ar', `${SAMPLE_RATE}`,
      'pipe:1',
    ]);

    let bytesReceived = 0;

    ffmpegProcess.stdout.on('data', (chunk) => {
      if (!isListening) {
        ffmpegProcess.kill();
        return;
      }

      bytesReceived += chunk.length;
      processAudioChunk(chunk);

      if (bytesReceived % (100 * 1024) < chunk.length) {
        console.log(`Stream: ${(bytesReceived / 1024).toFixed(1)} KB received`);
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log('FFmpeg stderr:', output);
      }
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process exited with code ${code}`);

      if (inSegment) {
        await finishSegment();
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

    console.log('FFmpeg process started');
    broadcastMessage('System', 'Stream connected via FFmpeg');
  }

  async function stopListening() {
    isListening = false;

    if (inSegment) {
      await finishSegment();
    }

    if (ffmpegProcess) {
      ffmpegProcess.kill();
      ffmpegProcess = null;
    }
  }

  return {
    startListening,
    stopListening,
    isListening: () => isListening,
  };
}

module.exports = {
  createAudioStreamService,
};
