'use strict';

var util = require('../util/util');
var Evented = require('../util/evented');
var Source = require('./source');

module.exports = VectorTileSource;

window.VectorTileSource = window.VectorTileSource || {};

window.VectorTileSource.QUEUE = [];
window.VectorTileSource.IS_EXECUTING = false;
window.VectorTileSource.doNext = function() {
	//Utils.log("window.VectorTileSource.doNext. Queue size is " + window.VectorTileSource.QUEUE.length + ", isExecuting : " + window.VectorTileSource.IS_EXECUTING);
  if (window.VectorTileSource.IS_EXECUTING || window.VectorTileSource.QUEUE.length == 0) {
    return;
  }
  window.VectorTileSource.IS_EXECUTING = true;
  var o = window.VectorTileSource.QUEUE.shift();
  var context = o.context;
  //Utils.log("window.VectorTileSource.doNext. Signal dispatched, queue is now " + window.VectorTileSource.QUEUE.length);
  // MOD FAB
  // TODO
  // RELOAD TILE IF workerID already specified
  context.workerID = o.dispatcher.send('load tile', o.params, o.callback); //context._loaded.bind(context));
};
window.VectorTileSource.addToQueue = function(context, dispatcher, params, callback) {
  //Utils.log("window.VectorTileSource.addToQueue: " + params.url);
  window.VectorTileSource.QUEUE.push({
    context: context,
    dispatcher: dispatcher,
    params: params,
	callback: callback
	});
};

function VectorTileSource(options) {
    util.extend(this, util.pick(options, ['url', 'tileSize']));

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
        if (this._pyramid) {
            this._pyramid.reload();
        }
    },

    redoPlacement: function() {
        if (!this._pyramid) {
            return;
        }

        var ids = this._pyramid.orderedIDs();
        for (var i = 0; i < ids.length; i++) {
            var tile = this._pyramid.getTile(ids[i]);
            this._redoTilePlacement(tile);
        }
    },

    render: Source._renderTiles,
    featuresAt: Source._vectorFeaturesAt,
    featuresIn: Source._vectorFeaturesIn,

    _loadTile: function(tile) {
        var overscaling = tile.coord.z > this.maxzoom ? Math.pow(2, tile.coord.z - this.maxzoom) : 1;
        var params = {
            url: tile.coord.url(this.tiles, this.maxzoom),
            uid: tile.uid,
            coord: tile.coord,
            zoom: tile.coord.z,
            maxZoom: this.maxzoom,
            tileSize: this.tileSize * overscaling,
            source: this.id,
            overscaling: overscaling,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            collisionDebug: this.map.collisionDebug
        };

		//Utils.log("VectorTileSource._loadTile. Tile with url " + params.url);
		
		if (tile.zoom <= 8) {
			if (tile.workerID) {
				this.dispatcher.send('reload tile', params, this._tileLoaded.bind(this, tile), tile.workerID);
			} else {
				tile.workerID = this.dispatcher.send('load tile', params, this._tileLoaded.bind(this, tile));
			}
		} else {
			// MOD FAB
		    var that = this;
		    var url = params.url;
		    var urlSplit = url.split("/");
		    var lastSplit = urlSplit[urlSplit.length - 1];
		    var fileName = lastSplit.split("?")[0].replace(".vector", "");
		    // window.mapController.currentBaseMapId
		    var path = "Vector_Bright" + "\\" + urlSplit[urlSplit.length - 3] + "\\" + urlSplit[urlSplit.length - 2] + "\\" + fileName;
		    if (VectorTileSource.offlineFolderReference) {
		        VectorTileSource.offlineFolderReference.getFileAsync(path).then(function () {
		            tile.workerID = that.dispatcher.send('load tile', params, that._tileLoaded.bind(that, tile));
		        }, function () {
		            window.VectorTileSource.addToQueue(that, that.dispatcher, params, that._tileLoadedLocal.bind(that, tile));
		            window.VectorTileSource.doNext();
		        });
		    } else {
		        window.VectorTileSource.addToQueue(that, that.dispatcher, params, that._tileLoadedLocal.bind(that, tile));
		        window.VectorTileSource.doNext();
                // delay until the next tile, rather than for each tile
		        window.offlineController.getStorageFolder(function (folder) {
		            VectorTileSource.offlineFolderReference = folder;
		        });
		    }
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
			//Utils.log("VectorTileSource._loadTile. tile.aborted");
            return;
		}
        if (err) {
			Utils.log("VectorTileSource._loadTile. err");
			Utils.logError(err);
            this.fire('tile.error', {tile: tile});
            return;
        }
		//Utils.log("VectorTileSource._loadTile. loadVectorData");
        tile.loadVectorData(data);

        if (tile.redoWhenDone) {
            tile.redoWhenDone = false;
            this._redoTilePlacement(tile);
        }

        this.fire('tile.load', {tile: tile});
    },

    _abortTile: function(tile) {
		// Utils.log("VectorTileSource trying to abort tile #" + tile.uid);
	    // remove from QUEUE if existing
	    for (var i = 0, l = window.VectorTileSource.QUEUE.length; i < l; i++) {
	        var item = window.VectorTileSource.QUEUE[i];
	        if (item.params.uid == tile.uid) {
	            // Utils.log("VectorTileSource ABORTED #" + tile.uid);
	            window.VectorTileSource.QUEUE.splice(i, 1);
	            break;
	        }
	    }
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

        if (!tile.loaded || tile.redoingPlacement) {
            tile.redoWhenDone = true;
            return;
        }

        tile.redoingPlacement = true;

        this.dispatcher.send('redo placement', {
            uid: tile.uid,
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
