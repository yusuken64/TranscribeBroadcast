const WebSocket = require('ws');

function createBroadcastService(server) {
  const wss = new WebSocket.Server({ server });
  const clients = new Set();

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    clients.add(ws);

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  function broadcastMessage(speaker, text, extra = {}) {
    const message = JSON.stringify({
      speaker,
      text,
      timestamp: new Date().toISOString(),
      ...extra,
    });

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  return {
    broadcastMessage,
  };
}

module.exports = {
  createBroadcastService,
};
