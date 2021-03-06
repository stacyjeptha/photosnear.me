require('./conf/config');

var connect = require('connect'),
    combo   = require('combohandler'),
    express = require('express'),
    YUI     = require('yui').YUI,

    app    = express.createServer(),
    pubDir = global.config.pubDir,
    Y      = YUI(global.config.yui.server);

// -- YUI config ---------------------------------------------------------------
YUI.namespace('Env.Flickr').API_KEY = global.config.flickr.api_key;
Y.use('parallel', 'pnm-place', 'pnm-photo', 'pnm-photos');

// -- Express config -----------------------------------------------------------
app.configure('development', function () {
    // Gives us pretty logs in development. Must run before other middleware.
    app.use(express.logger(
        '[:date] :req[x-forwarded-for] ":method :url" :status [:response-time ms]'
    ));
});

app.configure(function () {
    // Don't ignore trailing slashes in routes.
    app.set('strict routing', true);

    // Use our custom Handlebars-based view engine as the default.
    app.register('.handlebars', require('./lib/view'));
    app.set('view engine', 'handlebars');

    // Local values that will be shared across all views. Locals specified at
    // render time will override these values if they share the same name.
    app.set('view options', Y.merge(require('./conf/common'), {
        config: global.config
    }));

    // Middleware.
    app.use(app.router);
    app.use(express.favicon());
    app.use(express.static(pubDir));
});

app.configure('development', function () {
    app.use(express.errorHandler({
        dumpExceptions: true,
        showStack     : true
    }));
});

app.configure('production', function () {
    app.enable('view cache');
    app.use(express.errorHandler());
});

// -- Routes -------------------------------------------------------------------

// Root.
app.get('/', function (req, res) {
    res.render('index', {
        located: false
    });
});

// Combo-handler for JavaScript.
app.get('/combo', combo.combine({rootPath: pubDir + '/js'}), function (req, res) {
    if (connect.utils.conditionalGET(req)) {
        if (!connect.utils.modified(req, res)) {
            return connect.utils.notModified(res);
        }
    }

    res.send(res.body, 200);
});

// Dymanic resource for precompiled templates.
app.get('/templates.js', (function () {
    var precompiled = require('./lib/templates').precompiled,
        templates   = [];

    Y.Object.each(precompiled, function (template, name) {
        templates.push({
            name    : name,
            template: template
        });
    });

    return function (req, res) {
        res.render('templates', {
            layout   : false,
            templates: templates
        }, function (err, view) {
            res.send(view, {'Content-Type': 'application/javascript'}, 200);
        });
    };
}()));

app.get('/places/:id/', function (req, res) {
    var place    = new Y.PNM.Place({id: req.params.id}),
        photos   = new Y.PNM.Photos(),
        requests = new Y.Parallel();

    place.load(requests.add());
    photos.load({place: place}, requests.add());

    requests.done(function () {
        res.render('place', {
            located: true,

            place: {
                id  : place.get('id'),
                text: place.toString()
            },

            photos: photos.map(function (photo) {
                return photo.getAttrs(['id', 'clientId', 'thumbUrl']);
            }),

            initialData: {
                place : JSON.stringify(place),
                photos: JSON.stringify(photos)
            }
        });
    });
});

app.get('/photos/:id/', function (req, res) {
    var photo = new Y.PNM.Photo({id: req.params.id}),
        place;

    photo.load(function () {
        place = photo.get('place');

        res.render('photo', {
            located: true,

            place: {
                id  : place.get('id'),
                text: place.toString()
            },

            photo: Y.merge({title: 'Photo'}, photo.getAttrs([
                'title', 'largeUrl', 'pageUrl', 'description'
            ])),

            initialData: {
                place: JSON.stringify(place)
            }
        });
    });
});

module.exports = app;
