'use strict';

module.exports = Actor;

function Actor(target, parent) {
    this.target = target;
    this.parent = parent;
    this.callbacks = {};
    this.callbackID = 0;
    this.receive = this.receive.bind(this);
    this.target.addEventListener('message', this.receive, false);
}

Actor.prototype.receive = function(message) {
    var data = message.data,
        callback;

    if (data.type === '<response>') {
        callback = this.callbacks[data.id];
        delete this.callbacks[data.id];
        callback(data.error || null, data.data);
    } else if (typeof data.id !== 'undefined') {
        var id = data.id;
        this.parent[data.type](data.data, function(err, data, buffers) {
            this.postMessage({
                type: '<response>',
                id: String(id),
                error: err ? String(err) : null,
                data: data
            }, buffers);
        }.bind(this));
    } else {
        this.parent[data.type](data.data);
    }
};

Actor.prototype.send = function(type, data, callback, buffers) {
    var id = null;
    if (callback) this.callbacks[id = this.callbackID++] = callback;
	
	// MOD FAB
	if (type == "load tile") {
	  var target = this.target;
	  var url = data.url;
	  var urlSplit = url.split("/");
	  var lastSplit = urlSplit[urlSplit.length - 1];
	  var fileName = lastSplit.split("?")[0].replace(".vector", "");
	  // window.mapController.currentBaseMapId
	  var path = "Vector_Bright" + "\\" + urlSplit[urlSplit.length - 3] + "\\" + urlSplit[urlSplit.length - 2] + "\\" + fileName;
	  var fullPath = OfflineController.getDownloadPath() + "\\" + path;
	  if (path != "Vector_Bright\\15\\16827\\11686.pbf"){
        //return;
	  }
	  data.options = {
		  isOnline: false,
		  basePath: OfflineController.getDownloadPath(),
		  hasWriteAccess: OfflineController.hasWriteAccess(),
		  currentBaseMapId: "Vector_Bright",
		  path: fullPath
	  };
	  if (data.options.hasWriteAccess) {
		  var that = this;
		  var f = Windows.Storage.StorageFile.getFileFromPathAsync(fullPath);
		  f.done(
			  function (file) {
				var RESET_TILES = false;
				if (RESET_TILES){
					window.osmandController.lib.generateTile(OfflineController.getDownloadPath(), path).then(function() {
					  that.postMessage({
						  type: type,
							  id: String(id),
							  data: data
					  }, buffers);
					});
				} else {
					Utils.log("Already generated tile " + path + " in download folder " + OfflineController.getDownloadPath() + " ...");
					// file exists, let the worker load it
				  that.postMessage({ type: type, id: String(id), data: data }, buffers);
				}
			  }
			  , function (err) {
				  Utils.log("Generating tile " + path + " in download folder " + OfflineController.getDownloadPath() + "...");
					window.osmandController.lib.generateTile(OfflineController.getDownloadPath(), path).then(
					  function () {
						  Utils.log("Finished generating tile : " + path);
						  that.postMessage({ type: type, id: String(id), data: data }, buffers);
					  }, function (error) {
						Utils.log("Error while generating tile");
						Utils.logError(error);
						that.postMessage({
							type: type,
							id: String(id),
							data: data
						}, buffers);
					}
				  );
			  });

	  }
	  return;
	}
	
    this.postMessage({ type: type, id: String(id), data: data }, buffers);
};

Actor.prototype.postMessage = function(message, transferList) {
    try {
        this.target.postMessage(message, transferList);
    } catch (e) {
        this.target.postMessage(message); // No support for transferList on IE
    }
};
