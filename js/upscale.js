// js/upscale.js — Bicubic upscale with unsharp mask
'use strict';

App.upscale = {
  upscaleCanvas: function(source, scale) {
    var sw = source.width;
    var sh = source.height;
    var dw = sw * scale;
    var dh = sh * scale;

    // Step 1: High-quality upscale using browser's bicubic interpolation
    var upscaled = document.createElement('canvas');
    upscaled.width = dw;
    upscaled.height = dh;
    var uctx = upscaled.getContext('2d');
    uctx.imageSmoothingEnabled = true;
    uctx.imageSmoothingQuality = 'high';
    uctx.drawImage(source, 0, 0, dw, dh);

    // Step 2: Apply unsharp mask for sharpening
    var sharpened = document.createElement('canvas');
    sharpened.width = dw;
    sharpened.height = dh;
    var sctx = sharpened.getContext('2d');

    var imgData = uctx.getImageData(0, 0, dw, dh);
    var data = imgData.data;

    // Create blurred version for unsharp mask
    var blurred = App.upscale.blurImageData(imgData, dw, dh, 1);

    // Unsharp mask: original + strength * (original - blurred)
    var strength = 0.5;
    for (var i = 0; i < data.length; i += 4) {
      for (var c = 0; c < 3; c++) {
        var diff = data[i + c] - blurred[i + c];
        data[i + c] = Math.max(0, Math.min(255, Math.round(data[i + c] + strength * diff)));
      }
      // Preserve alpha
    }

    sctx.putImageData(imgData, 0, 0);
    return sharpened;
  },

  // Simple box blur for unsharp mask
  blurImageData: function(imageData, w, h, radius) {
    var src = new Uint8ClampedArray(imageData.data);
    var out = new Uint8ClampedArray(src.length);

    // Horizontal pass
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

    // Vertical pass
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
