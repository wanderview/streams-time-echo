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

function SyncPump(parser, socket) {
  var self = (this instanceof SyncPump)
           ? this
           : Object.create(SyncPump.prototype);

  self._parser = parser;
  self._socket = socket;

  return self;
}

SyncPump.prototype.execute = function() {
  var self = this;
  return self._parser.ready.then(function handleReady() {
    var chunk = self._parser.syncRead();
    while (chunk) {
      if (self._socket.readyState !== WebSocket.OPEN) {
        return;
      }
      self._socket.send(chunk.timestamp);
      var chunk = self._parser.syncRead();
    }
    return self._parser.ready.then(handleReady);
  });
};

function UnchainedSyncPump(parser, socket) {
  var self = (this instanceof SyncPump)
           ? this
           : Object.create(SyncPump.prototype);

  self._parser = parser;
  self._socket = socket;

  return self;
}

UnchainedSyncPump.prototype.execute = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    self._parser.ready.then(function handleReady() {
      var chunk = self._parser.syncRead();
      while (chunk) {
        if (self._socket.readyState !== WebSocket.OPEN) {
          resolve();
          return;
        }
        self._socket.send(chunk.timestamp);
        var chunk = self._parser.syncRead();
      }
      self._parser.ready.then(handleReady);
    });
  });
};

function AsyncPump(parser, socket) {
  var self = (this instanceof AsyncPump)
           ? this
           : Object.create(AsyncPump.prototype);

  self._parser = parser;
  self._socket = socket;

  return self;
}

AsyncPump.prototype.execute = function() {
  var self = this;
  return self._parser.asyncRead().then(function handleChunk(chunk) {
    if (self._socket.readyState !== WebSocket.OPEN) {
      return;
    }
    self._socket.send(chunk.timestamp);
    return self._parser.asyncRead().then(handleChunk);
  });
};

function UnchainedAsyncPump(parser, socket) {
  var self = (this instanceof AsyncPump)
           ? this
           : Object.create(AsyncPump.prototype);

  self._parser = parser;
  self._socket = socket;

  return self;
}

UnchainedAsyncPump.prototype.execute = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    self._parser.asyncRead().then(function handleChunk(chunk) {
      if (self._socket.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      self._socket.send(chunk.timestamp);
      self._parser.asyncRead().then(handleChunk);
    });
  });
};

function executeTest(opts) {
  opts.mode = opts.mode || 'sync';
  opts.time = opts.time || 5000;
  opts.cycles = opts.cycles || 2;
  opts.throttle = opts.throttle || 500;

  var ws;
  var lastData;

  return fetch('wsport').then(function(response) {
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
      lastData = event.data;
    };
    return fetch('time?time=' + opts.time +
                 '&cycles=' + opts.cycles +
                 '&throttle=' + opts.throttle);
  }).then(function(response) {
    var parser = new Parser(response.body);
    var pump;
    if (opts.mode === 'sync') {
      pump = new SyncPump(parser, ws);
    } else if (opts.mode === 'unchained-sync') {
      pump = new UnchainedSyncPump(parser, ws);
    } else if (opts.mode === 'async') {
      pump = new AsyncPump(parser, ws);
    } else if (opts.mode === 'unchained-async') {
      pump = new UnchainedAsyncPump(parser, ws);
    }
    return pump.execute();
  }).then(function() {
    return lastData;
  });
}

function displayText(text) {
  var child = document.createElement('div');
  child.textContent = text;
  var parent = document.getElementById('results');
  parent.appendChild(child);
  parent.appendChild(document.createElement('br'));
}

function executeTestList(list) {
  return new Promise(function(resolve, reject) {
    var test = list.shift();
    if (!test) {
      resolve();
      return;
    }
    return executeTest(test).then(function(result) {
      displayText(JSON.stringify(test) + ' => ' + result);
      executeTestList(list);
    });
  });
}

executeTestList([
  { mode: 'sync' },
  { mode: 'unchained-sync' },
  { mode: 'async' },
  { mode: 'unchained-async' },
]);
