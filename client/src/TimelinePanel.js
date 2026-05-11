const timelineOptions = [
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 600, label: '10m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1h' },
];

function TimelinePanel({
  timelineWindowSeconds,
  setTimelineWindowSeconds,
  timelineWindowStart,
  timelineItems,
  formatTime,
}) {
  return (
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
            {timelineOptions.map((option) => (
              <button
                key={option.value}
                className={
                  timelineWindowSeconds === option.value
                    ? 'timeline-button active'
                    : 'timeline-button'
                }
                onClick={() => setTimelineWindowSeconds(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="timeline-track">
        <div className="timeline-current-line" />
        {timelineItems.map((item) => (
          <div
            key={item.id}
            className={`timeline-item ${item.isPast ? 'timeline-item-past' : ''} ${
              item.isFuture ? 'timeline-item-future' : ''
            }`}
            style={{ left: `${item.left}%` }}
            title={`${item.speaker} @ ${item.formattedTime}: ${item.text}`}
          >
            <div className="timeline-dot" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default TimelinePanel;
