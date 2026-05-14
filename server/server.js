const express = require('express');
const path = require('path');
const http = require('http');
const database = require('./services/database');

const { createBroadcastService } = require('./services/broadcasting');
const { createAudioStreamService } = require('./services/audiostream');
const { transcribeSegment } = require('./services/transcription');
const transcriptsRoutes = require('./api/transcriptsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const SEGMENTS_DIR = path.join(__dirname, 'segments');

app.use(express.json());
app.use('/segments', express.static(SEGMENTS_DIR));

const server = http.createServer(app);
const { broadcastMessage } = createBroadcastService(server);
const audioStreamService = createAudioStreamService({
  segmentsDir: SEGMENTS_DIR,
  broadcastMessage,
  transcribeSegment,
});

//https://broadcastify.cdnstream1.com/41557
url = "https://broadcastify.cdnstream1.com/41557";
console.log(`Starting to listen to stream: ${url}`);
audioStreamService.startListening(url);

app.use('/api/transcripts', transcriptsRoutes);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await audioStreamService.stopListening();
  process.exit(0);
});