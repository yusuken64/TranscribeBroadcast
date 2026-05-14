function StreamControl({
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

      <div className="audio-player">
        <audio controls ref={audioRef} src={currentUrl} />
      </div>
    </section>
  );
}

export default StreamControl;
