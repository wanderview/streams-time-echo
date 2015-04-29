var fs = require('fs');
var http = require('http');
var path = require('path');
var url = require('url');

function getTime(req, res) {
  res.writeHead(200);

  function writeTime() {
    while (res.write(Date.now() + '\n'));
    res.once('drain', writeTime);
  }

  writeTime();
}

function postTime(req, res) {
  // TODO
}

var server = http.createServer(function(req, res) {
  var reqPath = url.parse(req.url).pathname;
  if (reqPath === '/') {
    reqPath = 'index.html';
  }

  if (reqPath === '/time') {
    if (req.method === 'GET') {
      return getTime(req, res);
    }

    if (req.method === 'POST') {
      return postTime(req, res);
    }
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

var port = 5000;
server.listen(port);
console.log('Listening on port ' + port);
