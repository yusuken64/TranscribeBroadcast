function StreamControl({
  streamUrl,
  onStreamUrlChange,
  onStart,
  onStop,
  isListening,
  status,
  currentUrl,
  audioRef,
}) {
  return (
    <section className="main-panel">
      <div className="app-header">
        <h1>Transcribe Broadcast</h1>
      </div>

      <form className="stream-form" onSubmit={onStart}>
        <label htmlFor="stream-url">Audio stream URL</label>
        <input
          id="stream-url"
          type="text"
          value={streamUrl}
          onChange={(event) => onStreamUrlChange(event.target.value)}
          placeholder="https://broadcastify.cdnstream1.com/41557"
        />
        <div className="stream-buttons">
          <button type="submit" disabled={isListening}>
            Start Listening
          </button>
          <button type="button" onClick={onStop} disabled={!isListening}>
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
  );
}

export default StreamControl;
