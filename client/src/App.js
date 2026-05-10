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
      timestamp: new Date().toISOString(),
    },
  ]);
  const [now, setNow] = useState(Date.now());
  const [timelineWindowSeconds, setTimelineWindowSeconds] = useState(60);

  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const chatWindowRef = useRef(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
            timestamp: message.timestamp || new Date().toISOString(),
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

  const timelineWindowStart = now - timelineWindowSeconds * 1000;
  const timelineWindowEnd = now + 5 * 1000;
  const timelineDuration = timelineWindowEnd - timelineWindowStart;

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const timelineItems = chatMessages
    .filter((message) => message.speaker !== 'System' && message.timestamp)
    .map((message) => {
      const timestampMs = new Date(message.timestamp).getTime();
      const clampedMs = Math.min(Math.max(timestampMs, timelineWindowStart), timelineWindowEnd);
      const left = ((clampedMs - timelineWindowStart) / timelineDuration) * 100;
      return {
        ...message,
        timestampMs,
        left,
        isPast: timestampMs < timelineWindowStart,
        isFuture: timestampMs > timelineWindowEnd,
        formattedTime: formatTime(message.timestamp),
      };
    })
    .filter((item) => item.timestampMs >= timelineWindowStart && item.timestampMs <= now);

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
                <div className="chat-message-header">
                  <span className="chat-speaker">{message.speaker}</span>
                  <span className="chat-timestamp">{formatTime(message.timestamp)}</span>
                </div>
                <p className="chat-message-body">{message.text}</p>
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

      <section className="timeline-panel">
        <div className="timeline-header">
          <div>
            <h2>Live timeline</h2>
            <p className="timeline-note">Broadcast events placed by timestamp; track follows real time.</p>
          </div>
          <div className="timeline-controls">
            <div className="timeline-labels">
              <span>{formatTime(timelineWindowStart)}</span>
              <span>Now</span>
            </div>
            <div className="timeline-buttons">
              <button
                className={timelineWindowSeconds === 60 ? 'timeline-button active' : 'timeline-button'}
                onClick={() => setTimelineWindowSeconds(60)}
              >
                1m
              </button>
              <button
                className={timelineWindowSeconds === 300 ? 'timeline-button active' : 'timeline-button'}
                onClick={() => setTimelineWindowSeconds(300)}
              >
                5m
              </button>
              <button
                className={timelineWindowSeconds === 600 ? 'timeline-button active' : 'timeline-button'}
                onClick={() => setTimelineWindowSeconds(600)}
              >
                10m
              </button>
              <button
                className={timelineWindowSeconds === 1800 ? 'timeline-button active' : 'timeline-button'}
                onClick={() => setTimelineWindowSeconds(1800)}
              >
                30m
              </button>
              <button
                className={timelineWindowSeconds === 3600 ? 'timeline-button active' : 'timeline-button'}
                onClick={() => setTimelineWindowSeconds(3600)}
              >
                1h
              </button>
            </div>
          </div>
        </div>

        <div className="timeline-track">
          <div className="timeline-current-line" />
          {timelineItems.map((item) => (
            <div
              key={item.id}
              className={`timeline-item ${item.isPast ? 'timeline-item-past' : ''} ${item.isFuture ? 'timeline-item-future' : ''}`}
              style={{ left: `${item.left}%` }}
              title={`${item.speaker} @ ${item.formattedTime}: ${item.text}`}
            >
              <div className="timeline-dot" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
