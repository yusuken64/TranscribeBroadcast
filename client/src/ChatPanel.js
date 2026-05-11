function ChatPanel({ chatMessages, formatTime, chatWindowRef }) {
  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <h2>Transcription Chat</h2>
      </div>
      <div className="chat-window" ref={chatWindowRef}>
        {chatMessages.map((message) => (
          <div key={message.id} className="chat-message">
            <div className="chat-message-header">
              <span className="chat-speaker">{message.speaker}</span>
              <div className="chat-meta">
                {message.segmentUrl && (
                  <a
                    className="chat-segment-play"
                    href={message.segmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open segment WAV"
                  >
                    <span className="chat-segment-play-icon">▶</span>
                  </a>
                )}
                <span className="chat-timestamp">{formatTime(message.timestamp)}</span>
              </div>
            </div>
            <p className="chat-message-body">{message.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default ChatPanel;
