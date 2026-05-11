const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs');

async function testTranscription() {
  // Check if a file path was provided
  const wavPath = process.argv[2];

  if (!wavPath) {
    console.log('Usage: node test-whisper.js <path-to-wav-file>');
    console.log('Example: node test-whisper.js ./server/segments/segment-1234567890-0.wav');
    process.exit(1);
  }

  // Resolve to absolute path
  const absoluteWavPath = path.resolve(wavPath);

  // Check if file exists
  if (!fs.existsSync(absoluteWavPath)) {
    console.error(`File not found: ${absoluteWavPath}`);
    process.exit(1);
  }

  console.log(`\n📁 Testing transcription for: ${absoluteWavPath}`);
  console.log(`📊 File size: ${fs.statSync(absoluteWavPath).size} bytes`);
  console.log(`🎤 Starting transcription with tiny model...\n`);

  try {
    const startTime = Date.now();

    const result = await nodewhisper(absoluteWavPath, {
      modelName: 'tiny',
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
        debug: (msg) => console.log(`   [DEBUG] ${msg}`),
        error: (msg) => console.error(`   [ERROR] ${msg}`),
      },
    });

    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n✅ Transcription complete in ${duration.toFixed(1)}s`);
    console.log(`📝 Result:\n`);
    console.log(`   "${result}"`);
    console.log(`\n`);
  } catch (error) {
    console.error(`\n❌ Transcription failed:`);
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`\n Stack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testTranscription();
