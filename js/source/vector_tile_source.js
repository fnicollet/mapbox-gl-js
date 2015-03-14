'use strict';

var util = require('../util/util');
var Evented = require('../util/evented');
var TileCoord = require('./tile_coord');
var Source = require('./source');

module.exports = VectorTileSource;

window.VectorTileSource = window.VectorTileSource || {};

window.VectorTileSource.QUEUE = [];
window.VectorTileSource.IS_EXECUTING = false;
window.VectorTileSource.doNext = function() {
	Utils.log("window.VectorTileSource.doNext. Queue size is " + window.VectorTileSource.QUEUE.length + ", isExecuting : " + window.VectorTileSource.IS_EXECUTING);
  if (window.VectorTileSource.IS_EXECUTING || window.VectorTileSource.QUEUE.length == 0) {
    return;
  }
  window.VectorTileSource.IS_EXECUTING = true;
  var o = window.VectorTileSource.QUEUE.shift();
  var context = o.context;
  Utils.log("window.VectorTileSource.doNext. Signal dispatched, queue is now " + window.VectorTileSource.QUEUE.length);
  // MOD FAB
  // TODO
  // RELOAD TILE IF workerID already specified
  context.workerID = o.dispatcher.send('load tile', o.params, o.callback); //context._loaded.bind(context));
};
window.VectorTileSource.addToQueue = function(context, dispatcher, params, callback) {
  Utils.log("window.VectorTileSource.addToQueue: " + params.url);
  window.VectorTileSource.QUEUE.push({
    context: context,
    dispatcher: dispatcher,
    params: params,
	callback: callback
	});
};

function VectorTileSource(options) {
    util.extend(this, util.pick(options, 'url', 'tileSize'));

    if (this.tileSize !== 512) {
        throw new Error('vector tile sources must have a tileSize of 512');
    }

    Source._loadTileJSON.call(this, options);
}

VectorTileSource.prototype = util.inherit(Evented, {
    minzoom: 0,
    maxzoom: 22,
    tileSize: 512,
    reparseOverscaled: true,
    _loaded: false,

    onAdd: function(map) {
        this.map = map;
    },

    loaded: function() {
        return this._pyramid && this._pyramid.loaded();
    },

    update: function(transform) {
        if (this._pyramid) {
            this._pyramid.update(this.used, transform);
        }
    },

    reload: function() {
        this._pyramid.reload();
    },

    redoPlacement: function() {
        var ids = this._pyramid.orderedIDs();
        for (var i = 0; i < ids.length; i++) {
            var tile = this._pyramid.getTile(ids[i]);
            this._redoTilePlacement(tile);
        }
    },

    render: Source._renderTiles,
    featuresAt: Source._vectorFeaturesAt,

    _loadTile: function(tile) {
        var overscaling = tile.zoom > this.maxzoom ? Math.pow(2, tile.zoom - this.maxzoom) : 1;
        var params = {
            url: TileCoord.url(tile.id, this.tiles, this.maxzoom),
            uid: tile.uid,
            id: tile.id,
            zoom: tile.zoom,
            maxZoom: this.maxzoom,
            tileSize: this.tileSize * overscaling,
            source: this.id,
            overscaling: overscaling,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            collisionDebug: this.map.collisionDebug
        };

		Utils.log("VectorTileSource._loadTile. Tile with url " + params.url);
		
		if (tile.zoom <= 8) {
			if (tile.workerID) {
				this.dispatcher.send('reload tile', params, this._tileLoaded.bind(this, tile), tile.workerID);
			} else {
				tile.workerID = this.dispatcher.send('load tile', params, this._tileLoaded.bind(this, tile));
			}
		} else {
			// MOD FAB
			window.VectorTileSource.addToQueue(this, this.dispatcher, params, this._tileLoadedLocal.bind(this, tile));
			window.VectorTileSource.doNext();
		}
    },
	
	// MOD FAB
	// _tileLoaded with some added stuff
	_tileLoadedLocal: function(tile, err, data) {
		window.VectorTileSource.IS_EXECUTING = false;
		window.VectorTileSource.doNext();
		this._tileLoaded(tile, err, data);
	},

    _tileLoaded: function(tile, err, data) {
        if (tile.aborted){
			Utils.log("VectorTileSource._loadTile. tile.aborted");
            return;
		}
        if (err) {
			Utils.log("VectorTileSource._loadTile. err");
			Utils.logError(err);
            this.fire('tile.error', {tile: tile});
            return;
        }
		Utils.log("VectorTileSource._loadTile. loadVectorData");
        tile.loadVectorData(data);
        this.fire('tile.load', {tile: tile});
    },

    _abortTile: function(tile) {
		Utils.log("VectorTileSource._abortTile");
        tile.aborted = true;
        this.dispatcher.send('abort tile', { uid: tile.uid, source: this.id }, null, tile.workerID);
    },

    _addTile: function(tile) {
        this.fire('tile.add', {tile: tile});
    },

    _removeTile: function(tile) {
        this.fire('tile.remove', {tile: tile});
    },

    _unloadTile: function(tile) {
        tile.unloadVectorData(this.map.painter);
        this.glyphAtlas.removeGlyphs(tile.uid);
        this.dispatcher.send('remove tile', { uid: tile.uid, source: this.id }, null, tile.workerID);
    },

    _redoTilePlacement: function(tile) {

        if (tile.redoingPlacement) {
            tile.redoWhenDone = true;
            return;
        }

        tile.redoingPlacement = true;

        this.dispatcher.send('redo placement', {
            id: tile.uid,
            source: this.id,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            collisionDebug: this.map.collisionDebug
        }, done.bind(this), tile.workerID);

        function done(_, data) {
            tile.reloadSymbolData(data, this.map.painter);
            this.fire('tile.load', {tile: tile});

            tile.redoingPlacement = false;
            if (tile.redoWhenDone) {
                this._redoTilePlacement(tile);
                tile.redoWhenDone = false;
            }
        }
    }
});
