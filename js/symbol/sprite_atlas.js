'use strict';

var ShelfPack = require('shelf-pack');
var browser = require('../util/browser');
var util = require('../util/util');

module.exports = SpriteAtlas;
function SpriteAtlas(width, height) {
    this.width = width;
    this.height = height;

    this.bin = new ShelfPack(width, height);
    this.images = {};
    this.data = false;
    this.texture = 0; // WebGL ID
    this.filter = 0; // WebGL ID
    this.pixelRatio = 1;
    this.dirty = true;
}

function copyBitmap(src, srcStride, srcX, srcY, dst, dstStride, dstX, dstY, width, height, wrap) {
	// floor values for non-integer pixelRatio
    dstStride = dstStride << 0;
    dstX = dstX << 0;
    dstY = dstY << 0;
    var srcI = srcY * srcStride + srcX;
    var dstI = dstY * dstStride + dstX;
    var x, y;

    if (wrap) {
        // add 1 pixel wrapped padding on each side of the image
        dstI -= dstStride;
        for (y = -1; y <= height; y++, srcI = ((y + height) % height + srcY) * srcStride + srcX, dstI += dstStride) {
            for (x = -1; x <= width; x++) {
                dst[dstI + x] = src[srcI + ((x + width) % width)];
            }
        }

    } else {
        for (y = 0; y < height; y++, srcI += srcStride, dstI += dstStride) {
            for (x = 0; x < width; x++) {
                dst[dstI + x] = src[srcI + x];
            }
        }
    }
}

SpriteAtlas.prototype.allocateImage = function(pixelWidth, pixelHeight) {

    pixelWidth = pixelWidth / this.pixelRatio;
    pixelHeight = pixelHeight / this.pixelRatio;

    // Increase to next number divisible by 4, but at least 1.
    // This is so we can scale down the texture coordinates and pack them
    // into 2 bytes rather than 4 bytes.
    // Pad icons to prevent them from polluting neighbours during linear interpolation
    var padding = 2;
    var packWidth = pixelWidth + padding + (4 - (pixelWidth + padding) % 4);
    var packHeight = pixelHeight + padding + (4 - (pixelHeight + padding) % 4);// + 4;

    var rect = this.bin.packOne(packWidth, packHeight);
    if (!rect) {
        util.warnOnce('SpriteAtlas out of space.');
        return null;
    }

    return rect;
};

SpriteAtlas.prototype.getImage = function(name, wrap) {
    if (this.images[name]) {
        return this.images[name];
    }

    if (!this.sprite) {
        return null;
    }

    var pos = this.sprite.getSpritePosition(name);
    if (!pos.width || !pos.height) {
        return null;
    }

    var rect = this.allocateImage(pos.width, pos.height);
    if (!rect) {
        return null;
    }

    var image = new AtlasImage(rect, pos.width / pos.pixelRatio, pos.height / pos.pixelRatio, pos.sdf, pos.pixelRatio / this.pixelRatio);
    this.images[name] = image;

    this.copy(rect, pos, wrap);

    return image;
};


// Return position of a repeating fill pattern.
SpriteAtlas.prototype.getPosition = function(name, repeating) {
    var image = this.getImage(name, repeating);
    var rect = image && image.rect;

    if (!rect) {
        return null;
    }

    var width = image.width * image.pixelRatio;
    var height = image.height * image.pixelRatio;
    var padding = 1;

    return {
        size: [image.width, image.height],
        tl: [(rect.x + padding)         / this.width, (rect.y + padding)          / this.height],
        br: [(rect.x + padding + width) / this.width, (rect.y + padding + height) / this.height]
    };
};


SpriteAtlas.prototype.allocate = function() {
    if (!this.data) {
        var w = Math.floor(this.width * this.pixelRatio);
        var h = Math.floor(this.height * this.pixelRatio);
        this.data = new Uint32Array(w * h);
        for (var i = 0; i < this.data.length; i++) {
            this.data[i] = 0;
        }
    }
};


SpriteAtlas.prototype.copy = function(dst, src, wrap) {
    if (!this.sprite.img.data) return;
    var srcImg = new Uint32Array(this.sprite.img.data.buffer);

    this.allocate();
    var dstImg = this.data;

    var padding = 1;

    copyBitmap(
        /* source buffer */  srcImg,
        /* source stride */  this.sprite.img.width,
        /* source x */       src.x,
        /* source y */       src.y,
        /* dest buffer */    dstImg,
        /* dest stride */    this.width * this.pixelRatio,
        /* dest x */         (dst.x + padding) * this.pixelRatio,
        /* dest y */         (dst.y + padding) * this.pixelRatio,
        /* icon dimension */ src.width,
        /* icon dimension */ src.height,
        /* wrap */ wrap
    );

    this.dirty = true;
};

SpriteAtlas.prototype.setSprite = function(sprite) {
    if (sprite) {
        this.pixelRatio = browser.devicePixelRatio > 1 ? 2 : 1;

        if (this.canvas) {
            this.canvas.width = this.width * this.pixelRatio;
            this.canvas.height = this.height * this.pixelRatio;
        }
    }
    this.sprite = sprite;
};

SpriteAtlas.prototype.addIcons = function(icons, callback) {
    for (var i = 0; i < icons.length; i++) {
        this.getImage(icons[i]);
    }

    callback(null, this.images);
};

SpriteAtlas.prototype.bind = function(gl, linear) {
    var first = false;
    if (!this.texture) {
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        first = true;
    } else {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    var filterVal = linear ? gl.LINEAR : gl.NEAREST;
    if (filterVal !== this.filter) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterVal);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterVal);
        this.filter = filterVal;
    }

    if (this.dirty) {
        this.allocate();

        if (first) {
            gl.texImage2D(
                gl.TEXTURE_2D, // enum target
                0, // ind level
                gl.RGBA, // ind internalformat
                this.width * this.pixelRatio, // GLsizei width
                this.height * this.pixelRatio, // GLsizei height
                0, // ind border
                gl.RGBA, // enum format
                gl.UNSIGNED_BYTE, // enum type
                new Uint8Array(this.data.buffer) // Object data
            );
        } else {
            gl.texSubImage2D(
                gl.TEXTURE_2D, // enum target
                0, // int level
                0, // int xoffset
                0, // int yoffset
                this.width * this.pixelRatio, // long width
                this.height * this.pixelRatio, // long height
                gl.RGBA, // enum format
                gl.UNSIGNED_BYTE, // enum type
                new Uint8Array(this.data.buffer) // Object pixels
            );
        }

        this.dirty = false;
    }
};

function AtlasImage(rect, width, height, sdf, pixelRatio) {
    this.rect = rect;
    this.width = width;
    this.height = height;
    this.sdf = sdf;
    this.pixelRatio = pixelRatio;
}
