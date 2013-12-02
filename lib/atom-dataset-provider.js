/*:tabSize=2:indentSize=2:noTabs=true:mode=javascript:*/

var _ = require('underscore'),
    express = require('express'),
    Options = require('./atom-dataset-provider/options'),
    scanner = require('./atom-dataset-provider/directory-scanner'),
    templater = require('./atom-dataset-provider/templater');
    fs = require('fs');
    https = require('https');
    
var options = (new Options).parse(process.argv);

var app = express.createServer();
///opt/atom-dataset-provider/keys

var keyoptions = {
    key: fs.readFileSync('/opt/atom-dataset-provider/keys/server.key'),
    cert: fs.readFileSync('/opt/atom-dataset-provider/keys/server.crt'),
};


app.configure(function() {
    if (options.username) {
        app.use(express.basicAuth(options.username, options.password));
    }
    app.use(express.logger());
    app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
    app.use(app.router);
    app.use(express.favicon());
    // Resolve '.' to actual path, or Express explodes with "Forbidden at SendStream.error"
    // has beneficial side-effect to normalising directory names
    options.directory = fs.realpathSync(options.directory) + '/';
    app.use(express.static(options.directory));
});

app.get('/', function(req, res) {
    var scanOptions = _.clone(req.query);
    // Default to only showing datafiles updated at least ten  minutes ago to avoid race conditions:
    // a file could be in the process of copying, getting progressively larger and causing nasty
    // data integrity issues. (Note: this prevents the whole _dataset_ showing up, which could be problematic.)
    var twominutesago = (d = new Date()).getTime() + d.getTimezoneOffset() * 60000 - 2 * 60 * 1000;
    
    _.defaults(scanOptions, { groupPattern: options.groupPattern, excludePattern: options.excludePattern,
        entryTitlePattern: options.entryTitlePattern, limit: 10, hashes: options.hashes, before: twominutesago,
        fileList: options.fileList });
    res.header('Content-Type', 'application/xml');
    scanner.scan(options.directory, scanOptions, function(err, scanResult) {
        var feedData = _.defaults(scanResult, {
          id: 'https://'+require('os').hostname()+':'+options.port+'/',
          title: options.title
        });
        templater.render(feedData, function(err, data) {
            res.send(data);
        });
    });
});

app.get('/atom2html.xsl', function(req, res) {
    res.header('Content-Type', 'application/xml');
    res.sendfile(__dirname+'/atom-dataset-provider/atom2html.xsl');
});

var server = https.createServer(keyoptions, app).listen(options.port);

server.on('connection', function(socket) {
  console.log("A new connection was made by a client.");
  socket.setTimeout(options.timeout * 1000); 
})

console.log(_.template(
  '*** Atom Provider'+
  ' now serving "<%=directory%>"'+
  ' on port <%=port%>'+
  ' (grouping by <%=groupPattern%>) ***',
  options
));
