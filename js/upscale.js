// js/upscale.js — Bicubic upscale with unsharp mask; optional AI upscale via UpscalerJS
'use strict';

var _tfLoaded = false;
var _upscalerLoaded = false;
var _modelLoaded = { 2: false, 4: false };
var _instances = {};

App.upscale = {
  // Synchronous bicubic upscale with unsharp mask
  upscaleCanvas: function(source, scale) {
    var sw = source.width;
    var sh = source.height;
    var dw = sw * scale;
    var dh = sh * scale;

    var upscaled = document.createElement('canvas');
    upscaled.width = dw;
    upscaled.height = dh;
    var uctx = upscaled.getContext('2d');
    uctx.imageSmoothingEnabled = true;
    uctx.imageSmoothingQuality = 'high';
    uctx.drawImage(source, 0, 0, dw, dh);

    var sharpened = document.createElement('canvas');
    sharpened.width = dw;
    sharpened.height = dh;
    var sctx = sharpened.getContext('2d');

    var imgData = uctx.getImageData(0, 0, dw, dh);
    var data = imgData.data;

    var blurred = App.upscale.blurImageData(imgData, dw, dh, 1);

    var strength = 0.5;
    for (var i = 0; i < data.length; i += 4) {
      for (var c = 0; c < 3; c++) {
        var diff = data[i + c] - blurred[i + c];
        data[i + c] = Math.max(0, Math.min(255, Math.round(data[i + c] + strength * diff)));
      }
    }

    sctx.putImageData(imgData, 0, 0);
    return sharpened;
  },

  // Smart dispatch: AI if enabled + available, bicubic fallback. Returns Promise<canvas>.
  upscaleCanvasSmart: function(source, scale) {
    var self = App.upscale;
    if (!App.state.aiUpscale) {
      return Promise.resolve(self.upscaleCanvas(source, scale));
    }
    return self._loadAILibs(scale)
      .then(function() {
        return self._aiUpscale(source, scale);
      })
      .catch(function(err) {
        console.warn('AI upscale failed, falling back to bicubic:', err);
        App.utils.showToast('AI unavailable — using bicubic', 'info');
        return self.upscaleCanvas(source, scale);
      });
  },

  _loadScript: function(url) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function() { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  },

  _loadAILibs: function(scale) {
    var self = App.upscale;
    var chain = Promise.resolve();
    if (!_tfLoaded) {
      chain = chain.then(function() {
        App.utils.showProgress(0, 'Loading AI engine (~2 MB)…');
        return self._loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js');
      }).then(function() { _tfLoaded = true; });
    }
    if (!_modelLoaded[scale]) {
      var modelUrl = scale === 4
        ? 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x4/index.min.js'
        : 'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x2/index.min.js';
      chain = chain.then(function() {
        App.utils.showProgress(50, 'Loading AI model (~900 KB)…');
        return self._loadScript(modelUrl);
      }).then(function() { _modelLoaded[scale] = true; });
    }
    if (!_upscalerLoaded) {
      chain = chain.then(function() {
        App.utils.showProgress(80, 'Loading upscaler…');
        return self._loadScript('https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js');
      }).then(function() { _upscalerLoaded = true; });
    }
    return chain;
  },

  _aiUpscale: function(source, scale) {
    if (!_instances[scale]) {
      var model = scale === 4 ? window.ESRGANSlim4x : window.ESRGANSlim2x;
      _instances[scale] = new window.Upscaler({ model: model });
    }
    var upscaler = _instances[scale];
    App.utils.showProgress(0, 'AI upscaling…');
    return upscaler.upscale(source.toDataURL(), {
      patchSize: 64,
      padding: 2,
      output: 'src',
      progress: function(pct) {
        App.utils.showProgress(Math.round(pct * 100), 'AI upscaling…');
      }
    }).then(function(resultSrc) {
      return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
          var out = document.createElement('canvas');
          out.width = img.naturalWidth;
          out.height = img.naturalHeight;
          out.getContext('2d').drawImage(img, 0, 0);
          resolve(out);
        };
        img.src = resultSrc;
      });
    });
  },

  // Simple box blur for unsharp mask
  blurImageData: function(imageData, w, h, radius) {
    var src = new Uint8ClampedArray(imageData.data);
    var out = new Uint8ClampedArray(src.length);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
        for (var dx = -radius; dx <= radius; dx++) {
          var nx = Math.min(w-1, Math.max(0, x + dx));
          var idx = (y * w + nx) * 4;
          rSum += src[idx]; gSum += src[idx+1]; bSum += src[idx+2]; aSum += src[idx+3];
          count++;
        }
        var idx2 = (y * w + x) * 4;
        out[idx2] = rSum / count;
        out[idx2+1] = gSum / count;
        out[idx2+2] = bSum / count;
        out[idx2+3] = aSum / count;
      }
    }

    var final_ = new Uint8ClampedArray(src.length);
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        var rSum2 = 0, gSum2 = 0, bSum2 = 0, aSum2 = 0, count2 = 0;
        for (var dy = -radius; dy <= radius; dy++) {
          var ny = Math.min(h-1, Math.max(0, y2 + dy));
          var idx3 = (ny * w + x2) * 4;
          rSum2 += out[idx3]; gSum2 += out[idx3+1]; bSum2 += out[idx3+2]; aSum2 += out[idx3+3];
          count2++;
        }
        var idx4 = (y2 * w + x2) * 4;
        final_[idx4] = rSum2 / count2;
        final_[idx4+1] = gSum2 / count2;
        final_[idx4+2] = bSum2 / count2;
        final_[idx4+3] = aSum2 / count2;
      }
    }
    return final_;
  },
};
