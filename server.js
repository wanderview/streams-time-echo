
var fs = require('fs');
var http = require('http');
var path = require('path');
var url = require('url');
var WebSocketServer = require('ws').Server;

var httpPort = 5000;
var wsPort = httpPort + 1;

function TimePump(outputStream, wsconn, opts) {
  var self = (this instanceof TimePump)
           ? this
           : Object.create(TimePump.prototype);

  opts = opts || {};

  self._numCycles = opts.cycles || 4;
  self._cycleRunTime = opts.time || 5000;
  self._firstResultTime;
  self._results = [];
  self._allowedTimestamps = opts.throttle || 4096;
  self._outputStream = outputStream;
  self._wsconn = wsconn;

  self._wsconn.on('message', function(message) {
    self._processResult(message);
    if (self._numCycles === 0) {
      self._outputStream.end();
      self._wsconn.close();
      self._done();
      return;
    }
    self._allowedTimestamps += 1;
    if (self._allowedTimestamps === 1) {
      self._writeTime();
    }
  });

  return self;
};

TimePump.prototype.execute = function(done) {
  this._done = done;
  this._writeTime();
};

TimePump.prototype._displayResults = function(runTime) {
  var min = Number.MAX_VALUE;
  var max = Number.MIN_VALUE;
  var total = 0;

  for (var i = 0; i < this._results.length; ++i) {
    min = Math.min(min, this._results[i]);
    max = Math.max(max, this._results[i]);
    total += this._results[i];
  }

  var mean = total / this._results.length;

  // runtime is in milliseconds... convert to ops/sec
  var bw = 1000 * this._results.length / runTime;

  this._wsconn.send(~~bw + ' ops/sec, latency min:' + ~~min + ' mean:' +
                    ~~mean + ' max:' + ~~max + ' ms');
};

TimePump.prototype._processResult = function(timestamp) {
  var now = Date.now();

  if (this._results.length === 0) {
    this._firstResultTime = now;
  }

  this._results.push(now - timestamp);

  var runTime = now - this._firstResultTime;
  if (runTime >= this._cycleRunTime) {
    this._displayResults(runTime);
    this._results = [];
    this._numCycles -= 1;
  }
};

TimePump.prototype._writeTime = function() {
  if (this._numCycles === 0) {
    return;
  }
  if (this._allowedTimestamps === 0) {
    return;
  }
  this._allowedTimestamps -= 1;
  if (this._outputStream.write(Date.now() + '\n')) {
    //setImmediate(this._writeTime.bind(this));
    this._writeTime();
  } else {
    this._outputStream.once('drain', this._writeTime.bind(this));
  }
}

var wsConnection;
var wss = new WebSocketServer({ port: wsPort });
wss.on('connection', function(conn) {
  wsConnection = conn;
});

var pump;
var server = http.createServer(function(req, res) {
  var reqUrl = url.parse(req.url, true /* parse query */);
  var reqPath = reqUrl.pathname;
  if (reqPath === '/') {
    reqPath = 'index.html';
  }

  if (reqPath === '/wsport') {
    res.writeHead(200);
    res.end('' + wsPort);
    return;
  }

  if (reqPath === '/time') {
    if (pump) {
      res.writeHead(503);
      res.end();
      return;
    }
    res.writeHead(200);
    pump = new TimePump(res, wsConnection, reqUrl.query);
    pump.execute(function() {
      pump = null;
    });
    return;
  }

  var file = path.join(__dirname, reqPath);
  fs.readFile(file, function(err, data) {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200);
    res.end(data);
  });
});

server.listen(httpPort);
console.log('Listening on port ' + httpPort);
