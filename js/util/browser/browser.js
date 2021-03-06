'use strict';

/**
 * Unlike js/util/browser.js, this code is written with the expectation
 * of a browser environment with a global 'window' object
 * @module browser
 * @private
 */

exports.window = window;

/**
 * Provides a function that outputs milliseconds: either performance.now()
 * or a fallback to Date.now()
 */
module.exports.now = (function() {
    if (window.performance &&
        window.performance.now) {
        return window.performance.now.bind(window.performance);
    } else {
        return Date.now.bind(Date);
    }
}());

var frame = window.requestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame;

exports.frame = function(fn) {
    return frame(fn);
};

var cancel = window.cancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.msCancelAnimationFrame;

exports.cancelFrame = function(id) {
    cancel(id);
};

exports.timed = function (fn, dur, ctx) {
    if (!dur) {
        fn.call(ctx, 1);
        return null;
    }

    var abort = false,
        start = module.exports.now();

    function tick(now) {
        if (abort) return;
        now = module.exports.now();

        if (now >= start + dur) {
            fn.call(ctx, 1);
        } else {
            fn.call(ctx, (now - start) / dur);
            exports.frame(tick);
        }
    }

    exports.frame(tick);

    return function() { abort = true; };
};

/**
 * Test if the current browser supports Mapbox GL JS
 * @param {Object} options
 * @param {boolean} [options.failIfMajorPerformanceCaveat=false] Return `false`
 *   if the performance of Mapbox GL JS would be dramatically worse than
 *   expected (i.e. a software renderer would be used)
 * @return {boolean}
 */
exports.supported = require('mapbox-gl-js-supported');

exports.hardwareConcurrency = navigator.hardwareConcurrency || 4;

Object.defineProperty(exports, 'devicePixelRatio', {
    get: function() { return window.devicePixelRatio; }
});

exports.supportsWebp = false;

var webpImgTest = document.createElement('img');
webpImgTest.onload = function() {
    exports.supportsWebp = true;
};
webpImgTest.src = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQ//73v/+BiOh/AAA=';

exports.supportsGeolocation = !!navigator.geolocation;
