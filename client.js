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
      return this._values.shift();
    }
    this._readChunk();
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
    var data = self._remaining + self._decoder.decode(chunk);

    var start = 0;
    while (start < data.length) {
      var eol = data.indexOf('\n', start);
      if (eol - start - 1 < 1) {
        break;
      }
      self._values.push({
         timestamp: data.substring(start, eol - 1)
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

fetch('time').then(function(response) {
  var parser = new Parser(response.body);
  parser.asyncRead().then(function handleChunk(chunk) {
    // TODO: post parsed timestamps back to the server
    console.log(chunk);
    parser.asyncRead().then(handleChunk);
  });
});
