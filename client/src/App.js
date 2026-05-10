import { useEffect, useRef, useState } from 'react';

function App() {
  const [streamUrl, setStreamUrl] = useState('https://broadcastify.cdnstream1.com/41557');
  const [currentUrl, setCurrentUrl] = useState('');
  const [status, setStatus] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      speaker: 'System',
      text: 'Waiting for transcription from the audio stream...',
    },
  ]);

  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const chatWindowRef = useRef(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const wsUrl = 'ws://localhost:5000';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            speaker: message.speaker,
            text: message.text,
            segmentUrl: message.segmentUrl || null,
          },
        ]);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket');
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleStart = async (event) => {
    event.preventDefault();
    const trimmedUrl = streamUrl.trim();

    if (!trimmedUrl) {
      setStatus('Please enter a valid audio stream URL.');
      return;
    }

    try {
      const response = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(`Error: ${data.error}`);
        return;
      }

      setCurrentUrl(trimmedUrl);
      setIsListening(true);
      setStatus(`Listening to ${trimmedUrl}`);

      if (audioRef.current) {
        audioRef.current.load();
        audioRef.current.play().catch(() => {
          setStatus('Stream loaded. Click play if audio does not start automatically.');
        });
      }
    } catch (error) {
      console.error('Error starting stream:', error);
      setStatus('Failed to start stream. Check the server and try again.');
    }
  };

  const handleStop = async () => {
    try {
      const response = await fetch('/api/stream/stop', {
        method: 'POST',
      });

      const data = await response.json();
      if (!response.ok) {
        setStatus(`Error stopping stream: ${data.error}`);
        return;
      }

      setIsListening(false);
      setStatus('Stream stopped.');
      setCurrentUrl('');

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    } catch (error) {
      console.error('Error stopping stream:', error);
      setStatus('Failed to stop stream. Check the server and try again.');
    }
  };

  return (
    <div className="app-container">
      <div className="app-layout">
        <section className="main-panel">
          <div className="app-header">
            <h1>Transcribe Broadcast</h1>
          </div>

          <form className="stream-form" onSubmit={handleStart}>
            <label htmlFor="stream-url">Audio stream URL</label>
            <input
              id="stream-url"
              type="text"
              value={streamUrl}
              onChange={(event) => setStreamUrl(event.target.value)}
              placeholder="https://broadcastify.cdnstream1.com/41557"
            />
            <div className="stream-buttons">
              <button type="submit" disabled={isListening}>
                Start Listening
              </button>
              <button type="button" onClick={handleStop} disabled={!isListening}>
                Stop Listening
              </button>
            </div>
          </form>

          <p className="hint">
            Enter the full stream URL, for example: <code>https://broadcastify.cdnstream1.com/41557</code>
          </p>
          {status && <p className="status">{status}</p>}

          {currentUrl && (
            <div className="audio-player">
              <audio controls ref={audioRef} src={currentUrl} />
            </div>
          )}
        </section>

        <aside className="chat-panel">
          <div className="chat-header">
            <h2>Transcription Chat</h2>
          </div>
          <div className="chat-window" ref={chatWindowRef}>
            {chatMessages.map((message) => (
              <div key={message.id} className="chat-message">
                <span className="chat-speaker">{message.speaker}</span>
                <p>{message.text}</p>
                {message.segmentUrl && (
                  <p>
                    <a href={message.segmentUrl} target="_blank" rel="noreferrer">
                      Open segment WAV
                    </a>
                  </p>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
