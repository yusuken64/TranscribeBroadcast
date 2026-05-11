const path = require('path');
const { nodewhisper } = require('nodejs-whisper');

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base.en';

async function transcribeSegment(wavPath, broadcastMessage) {
  console.log(`Starting transcription of ${path.basename(wavPath)} with model: ${WHISPER_MODEL}`);

  // Ensure absolute path
  const absoluteWavPath = path.resolve(wavPath);

  // Create a promise with timeout to ensure process termination
  const transcriptionPromise = nodewhisper(absoluteWavPath, {
    modelName: WHISPER_MODEL,
    whisperOptions: {

      outputInJson: true,
      outputInText: false,

      outputInVtt: false,
      outputInSrt: false,
      outputInCsv: false,

      noTimestamps: false,
      nt: false,

      np: true,
      vad: true,
    },
    removeWavFileAfterTranscription: false,
    logger: {
      log: (...args) => console.log(...args),
      debug: (...args) => console.debug(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    },
  });

  // Add timeout to prevent hanging processes
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Transcription timeout')), 300000); // 5 minutes timeout
  });

  const result = await Promise.race([transcriptionPromise, timeoutPromise]);

  const messages = parseTranscript(result);
  const now = new Date();
  const formatted = now.toLocaleString('sv-SE', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');


  messages.forEach(element => {

    broadcastMessage(
      `[${formatted}] (${element.duration.toFixed(1)}s)`,
      element.message,
      {
        segmentUrl: `/segments/${path.basename(wavPath)}`,
      }
    );
  });
}

function timeToSeconds(time) {
  const [h, m, s] = time.split(':');
  return (
    Number(h) * 3600 +
    Number(m) * 60 +
    Number(s)
  );
}

function parseTranscript(text) {
  const regex =
    /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s-->\s(\d{2}:\d{2}:\d{2}\.\d{3})\]\s(.+)/g;

  const results = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const start = match[1];
    const end = match[2];
    const message = match[3];

    const duration = timeToSeconds(end) - timeToSeconds(start);

    results.push({
      start,
      end,
      duration,
      message,
    });
  }

  return results;
}

module.exports = {
  transcribeSegment,
};
