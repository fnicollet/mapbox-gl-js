'use strict';

var util = require('../util/util');
var Evented = require('../util/evented');
var Source = require('./source');
var normalizeURL = require('../util/mapbox').normalizeTileURL;

module.exports = VectorTileSource;

window.VectorTileSource = window.VectorTileSource || {};

window.VectorTileSource.QUEUE = [];
window.VectorTileSource.IS_EXECUTING = false;
window.VectorTileSource.TO_ABORT_QUEUE = [];
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
    this._options = util.extend({ type: 'vector' }, options);

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
    isTileClipped: true,

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

    serialize: function() {
        return util.extend({}, this._options);
    },

    getVisibleCoordinates: Source._getVisibleCoordinates,
    getTile: Source._getTile,

    queryRenderedFeatures: Source._queryRenderedVectorFeatures,
    querySourceFeatures: Source._querySourceFeatures,

    _loadTile: function(tile) {
        var overscaling = tile.coord.z > this.maxzoom ? Math.pow(2, tile.coord.z - this.maxzoom) : 1;
        var params = {
            url: normalizeURL(tile.coord.url(this.tiles, this.maxzoom), this.url),
            uid: tile.uid,
            coord: tile.coord,
            zoom: tile.coord.z,
            tileSize: this.tileSize * overscaling,
            source: this.id,
            overscaling: overscaling,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            showCollisionBoxes: this.map.showCollisionBoxes
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
					var abortIdx = window.VectorTileSource.TO_ABORT_QUEUE.indexOf(tile.uid);
		            if (abortIdx != -1) {
		                //Utils.log("VectorTileSource._loadTile. ABORTED");
		                window.VectorTileSource.TO_ABORT_QUEUE.splice(abortIdx, 1);
		                return;
		            }
					if (tile.workerID) {
						params.rawTileData = tile.rawTileData;
						that.dispatcher.send('reload tile', params, that._tileLoaded.bind(that, tile), tile.workerID);
					} else {
						tile.workerID = that.dispatcher.send('load tile', params, that._tileLoaded.bind(that, tile));
					}
		            //tile.workerID = that.dispatcher.send('load tile', params, that._tileLoaded.bind(that, tile));
		        }, function () {
					var abortIdx = window.VectorTileSource.TO_ABORT_QUEUE.indexOf(tile.uid);
		            if (abortIdx != -1) {
		                //Utils.log("VectorTileSource._loadTile. ABORTED");
		                window.VectorTileSource.TO_ABORT_QUEUE.splice(abortIdx, 1);
		                return;
		            }
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
            tile.errored = true;
            this.fire('tile.error', {tile: tile, error: err});
            return;
        }
		//Utils.log("VectorTileSource._loadTile. loadVectorData");
        tile.loadVectorData(data);

        if (tile.redoWhenDone) {
            tile.redoWhenDone = false;
            tile.redoPlacement(this);
        }

        this.fire('tile.load', {tile: tile});
        this.fire('tile.stats', data.bucketStats);
    },

    _abortTile: function(tile) {
		// Utils.log("VectorTileSource trying to abort tile #" + tile.uid);
	    // remove from QUEUE if existing
		var found = false;
	    for (var i = 0, l = window.VectorTileSource.QUEUE.length; i < l; i++) {
	        var item = window.VectorTileSource.QUEUE[i];
	        if (item.params.uid == tile.uid) {
	            // Utils.log("VectorTileSource ABORTED #" + tile.uid);
	            window.VectorTileSource.QUEUE.splice(i, 1);
				found = true;
	            break;
	        }
	    }
		if (!found) {
            //Utils.log("VectorTileSource couldn't abort tile #" + tile.uid);
            window.VectorTileSource.TO_ABORT_QUEUE.push(tile.uid)
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
        this.dispatcher.send('remove tile', { uid: tile.uid, source: this.id }, null, tile.workerID);
    },

    redoPlacement: Source.redoPlacement,

    _redoTilePlacement: function(tile) {
        tile.redoPlacement(this);
    }
});
