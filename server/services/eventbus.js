const EventEmitter = require('events');

class EventBus extends EventEmitter {
  emitTranscript(transcriptEvent) {
    this.emit('transcript', transcriptEvent);
  }

  onTranscript(listener) {
    this.on('transcript', listener);
  }

  emitAudioSegment(segmentEvent) {
    this.emit('audioSegment', segmentEvent);
  }

  onAudioSegment(listener) {
    this.on('audioSegment', listener);
  }

  emitSystemEvent(systemEvent) {
    this.emit('system', systemEvent);
  }

  onSystemEvent(listener) {
    this.on('system', listener);
  }
}

const eventBus = new EventBus();

eventBus.setMaxListeners(50);

module.exports = eventBus;