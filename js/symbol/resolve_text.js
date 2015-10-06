'use strict';

var resolveTokens = require('../util/token');

module.exports = resolveText;

/**
 * For an array of features determine what glyphs need to be loaded
 * and apply any text preprocessing. The remaining users of text should
 * use the `textFeatures` key returned by this function rather than accessing
 * feature text directly.
 * @private
 */
function resolveText(features, layoutProperties, codepoints) {
    var textFeatures = [];

    for (var i = 0, fl = features.length; i < fl; i++) {
        var text = resolveTokens(features[i].properties, layoutProperties['text-field']);
        if (!text) {
            textFeatures[i] = null;
            continue;
        }
        text = text.toString();

        var transform = layoutProperties['text-transform'];
        if (transform === 'uppercase') {
            text = text.toLocaleUpperCase();
        } else if (transform === 'lowercase') {
            text = text.toLocaleLowerCase();
        }
		
		// MOD FAB
		// https://github.com/mapbox/mapbox-gl-js/pull/705
		if (isRTL(text)) {
			var textWords = text.split(' ');
			var ltrText = '';
			var rtlBuffer = '';
			for (var t = 0; t < textWords.length; t++) {
				if (isRTL(textWords[t])) {
					var rtlWord = textWords[t].split('').reverse().join('');
					rtlBuffer = rtlWord + ' ' + rtlBuffer;
				}
				else {
					ltrText += rtlBuffer + ' ' + textWords[t];
					rtlBuffer = '';
				}
			}
			if (ltrText.length && rtlBuffer.length) {
				ltrText += ' ';
			}
			ltrText += rtlBuffer;
			text = ltrText;
		}


        for (var j = 0; j < text.length; j++) {
            codepoints[text.charCodeAt(j)] = true;
        }

        // Track indexes of features with text.
        textFeatures[i] = text;
    }
	
    return textFeatures;
}


// MOD FAB
// https://github.com/mapbox/mapbox-gl-js/pull/705
function isRTL(s) {
    var rtlChars = '\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC',
    rtlDirCheck = new RegExp('^[^' + rtlChars + ']*?[' + rtlChars + ']');
    return rtlDirCheck.test(s);
}

function uniq(ids, alreadyHave) {
    var u = [];
    var last;
    ids.sort(sortNumbers);
    for (var i = 0; i < ids.length; i++) {
        if (ids[i] !== last) {
            last = ids[i];
            if (!alreadyHave[last]) u.push(ids[i]);
        }
    }
    return u;
}

function sortNumbers(a, b) {
    return a - b;
}
