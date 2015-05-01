'use strict';

function Parser(source) {
  var self = (this instanceof Parser)
           ? this
           : Object.create(Parser.prototype);

  self._values = [];
  self._remaining = '';
  self._source = source.getReader();
  self._decoder = new TextDecoder('utf-8');

  self._readChunk();

  return self;
}

Parser.prototype = {
  get ready() {
    return this._ready;
  },

  syncRead: function() {
    if (this._values.length > 0) {
      var result = this._values.shift();
      if (this._values.length === 0) {
        this._readChunk();
      }
      return result;
    }
    return null;
  },

  asyncRead: function() {
    var self = this;
    return self.ready.then(function() {
      return self.syncRead();
    });
  },

  _readChunk: function() {
    var self = this;
    self._ready = new Promise(function(resolve, reject) {
      self._readyResolve = resolve;
      self._readyReject = reject;
    });
    self._source.read().then(function(chunk) {
      self._processChunk(chunk.value);
    });
  },

  _processChunk: function(chunk) {
    var self = this;
    if (!chunk) {
      return;
    }
    var data = self._remaining + self._decoder.decode(chunk);

    var start = 0;
    while (start < data.length) {
      var eol = data.indexOf('\n', start);
      if (eol - start - 1 < 1) {
        break;
      }
      self._values.push({
         timestamp: data.substring(start, eol)
      });
      start = eol + 1;
    }

    if (start < data.length) {
      self._remaining = data.substring(start);
    } else {
      self._remaining = '';
    }

    self._readyResolve();
  },
}

var ws;

fetch('wsport').then(function(response) {
  return response.text();
}).then(function(text) {
  var url = new URL('/', window.location);
  url.protocol = 'ws:';
  url.port = ~~text;
  ws = new WebSocket(url);
  return new Promise(function(resolve, reject) {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
}).then(function() {
  ws.onmessage = function(event) {
    console.log(event.data);
  };
  return fetch('time?time=1000&cycles=5&throttle=500');
}).then(function(response) {
  var parser = new Parser(response.body);
  parser.asyncRead().then(function handleChunk(chunk) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(chunk.timestamp);
    parser.asyncRead().then(handleChunk);
  });
  /*
  parser.ready.then(function handleReady() {
    var chunk = parser.syncRead();
    while (chunk) {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(chunk.timestamp);
      var chunk = parser.syncRead();
    }
    parser.ready.then(handleReady);
  });
  */
});
