const path = require('path');
const { nodewhisper } = require('nodejs-whisper');

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny';

async function transcribeSegment(wavPath, broadcastMessage) {
  try {
    console.log(`Starting transcription of ${path.basename(wavPath)} with model: ${WHISPER_MODEL}`);

    const result = await nodewhisper(wavPath, {
      modelName: WHISPER_MODEL,
      whisperOptions: {
        outputInText: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,
        noTimestamps: true,
        nt: true,
        np: true,
        word_timestamps: false,
        splitOnWord: true,
        vad: true,
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
    const now = new Date().toLocaleString();

    if (!raw) {
      broadcastMessage('System', `[${now}] (0.0s)\n[No speech detected]`);
      return;
    }

    const match = raw.match(/\[(\d+):(\d+):([\d.]+)\s*-->\s*(\d+):(\d+):([\d.]+)\]\s*([\s\S]*)/);
    let durationSeconds = 0;
    let transcript = raw;

    if (match) {
      const startHours = parseInt(match[1], 10);
      const startMinutes = parseInt(match[2], 10);
      const startSeconds = parseFloat(match[3]);
      const endHours = parseInt(match[4], 10);
      const endMinutes = parseInt(match[5], 10);
      const endSeconds = parseFloat(match[6]);

      const startTotal = startHours * 3600 + startMinutes * 60 + startSeconds;
      const endTotal = endHours * 3600 + endMinutes * 60 + endSeconds;
      durationSeconds = endTotal - startTotal;
      transcript = match[7].trim();
    }

    const timestamp = `[${now}] (${durationSeconds.toFixed(1)}s)`;

    if (transcript && transcript.trim() !== '[BLANK_AUDIO]') {
      broadcastMessage(timestamp, transcript.trim(), {
        segmentUrl: `/segments/${path.basename(wavPath)}`,
      });
    }
  } catch (error) {
    console.error('Transcription error:', error);
    broadcastMessage('System', `Transcription failed: ${error.message}`);
  }
}

module.exports = {
  transcribeSegment,
};
