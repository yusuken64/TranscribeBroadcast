import { useEffect, useRef, useState } from 'react';
import StreamControl from './StreamControl';
import ChatPanel from './ChatPanel';
import TimelinePanel from './TimelinePanel';

function App() {
  const [streamUrl, setStreamUrl] = useState('https://broadcastify.cdnstream1.com/41557');
  const [currentUrl, setCurrentUrl] = useState('https://broadcastify.cdnstream1.com/41557');
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

      const left =
        ((timestampMs - timelineWindowStart) / timelineDuration) * 100;

      return {
        ...message,
        timestampMs,
        left,
        isPast: timestampMs < timelineWindowStart,
        isFuture: timestampMs > timelineWindowEnd,
        formattedTime: formatTime(message.timestamp),
      };
    })
    .filter((item) =>
      !item.isPast &&
      item.timestampMs >= timelineWindowStart &&
      item.timestampMs <= timelineWindowEnd
    );

  return (
    <div className="app-container">
      <div className="app-layout">
        <StreamControl
          isListening={isListening}
          status={status}
          currentUrl={currentUrl}
          audioRef={audioRef}
        />
        <ChatPanel
          chatMessages={chatMessages}
          formatTime={formatTime}
          chatWindowRef={chatWindowRef}
        />
      </div>
      <TimelinePanel
        timelineWindowSeconds={timelineWindowSeconds}
        setTimelineWindowSeconds={setTimelineWindowSeconds}
        timelineWindowStart={timelineWindowStart}
        timelineItems={timelineItems}
        formatTime={formatTime}
      />
    </div>
  );
}

export default App;
