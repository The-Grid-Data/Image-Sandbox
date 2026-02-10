// js/bg-removal.js — Background removal, brush painting, raster processing
'use strict';

var _currentRunId = 0;
var _brushPainting = false;

App.bgRemoval = {
  autoDetectBgColor: function() {
    var state = App.state;
    var dom = App.dom;
    var data = state.originalData.data;
    var w = state.originalData.width;
    var h = state.originalData.height;
    // Sample corner pixels
    var corners = [
      0,
      (w - 1) * 4,
      (h - 1) * w * 4,
      ((h - 1) * w + (w - 1)) * 4
    ];
    var samples = corners.slice();
    var offsets = [1, w, w+1];
    for (var ci = 0; ci < corners.length; ci++) {
      var c = corners[ci];
      for (var oi = 0; oi < offsets.length; oi++) {
        var idx = c + offsets[oi] * 4;
        if (idx >= 0 && idx < data.length - 3) samples.push(idx);
      }
    }
    var rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (var si = 0; si < samples.length; si++) {
      var i = samples[si];
      if (data[i+3] > 128) {
        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++;
      }
    }
    if (count > 0) {
      var r = Math.round(rSum / count);
      var g = Math.round(gSum / count);
      var b = Math.round(bSum / count);
      var hex = App.utils.rgbToHex(r, g, b);
      state.bgRemovalColor = hex;
      dom.bgRemovalColorInput.value = hex;
      dom.bgRemovalHexInput.value = hex;
      App.utils.showToast('Detected background: ' + hex, 'success');
    }
  },

  setBrushMode: function(mode) {
    var state = App.state;
    var dom = App.dom;
    if (mode !== null && state.selectiveMode) return;
    state.brushMode = mode;
    dom.btnBrushRestore.classList.toggle('active', mode === 'restore');
    dom.btnBrushErase.classList.toggle('active', mode === 'erase');
    dom.btnBrushOff.classList.toggle('active', mode === null);
    dom.comparison.classList.toggle('brush-mode', mode !== null);
    if (mode !== null) {
      dom.originalLayer.style.clipPath = 'inset(0 100% 0 0)';
      dom.processedLayer.style.clipPath = 'inset(0)';
      dom.comparisonHandle.style.display = 'none';
    } else {
      var pct = state.sliderPos;
      dom.originalLayer.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      dom.processedLayer.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      dom.comparisonHandle.style.display = '';
    }
    App.bgRemoval.updateBrushCursor();
  },

  updateBrushCursor: function() {
    var state = App.state;
    var dom = App.dom;
    var size = state.brushSize;
    dom.brushCursor.style.width = size + 'px';
    dom.brushCursor.style.height = size + 'px';
    if (state.brushMode === 'restore') {
      dom.brushCursor.style.borderColor = 'rgba(34, 197, 94, 0.8)';
    } else if (state.brushMode === 'erase') {
      dom.brushCursor.style.borderColor = 'rgba(239, 68, 68, 0.8)';
    }
  },

  paintBrush: function(clientX, clientY) {
    var state = App.state;
    var dom = App.dom;
    if (!state.brushMode || !state.processedCanvas) return;

    var processedEl = dom.processedLayer.querySelector('canvas');
    if (!processedEl) return;

    var rect = processedEl.getBoundingClientRect();
    var scaleX = state.processedCanvas.width / rect.width;
    var scaleY = state.processedCanvas.height / rect.height;
    var cx = (clientX - rect.left) * scaleX;
    var cy = (clientY - rect.top) * scaleY;

    var w = state.processedCanvas.width;
    var h = state.processedCanvas.height;
    var radius = (state.brushSize / 2) * scaleX;

    if (!state.brushMask) {
      state.brushMask = new Float32Array(w * h);
    }

    var isRestore = state.brushMode === 'restore';

    var x0 = Math.max(0, Math.floor(cx - radius));
    var x1 = Math.min(w - 1, Math.ceil(cx + radius));
    var y0 = Math.max(0, Math.floor(cy - radius));
    var y1 = Math.min(h - 1, Math.ceil(cy + radius));

    for (var py = y0; py <= y1; py++) {
      for (var px = x0; px <= x1; px++) {
        var dx = px - cx;
        var dy = py - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        var strength = 1 - (dist / radius);
        var idx = py * w + px;
        if (isRestore) {
          state.brushMask[idx] = Math.min(1, state.brushMask[idx] + strength * 0.3);
        } else {
          state.brushMask[idx] = Math.max(-1, state.brushMask[idx] - strength * 0.3);
        }
      }
    }

    App.bgRemoval.applyBrushToProcessed();
  },

  applyBrushToProcessed: function() {
    var state = App.state;
    var dom = App.dom;
    if (!state.originalData || !state.processedCanvas) return;

    var src = state.originalData;
    var w = src.width;
    var h = src.height;
    var srcData = src.data;

    var canvas = document.createElement('canvas');
    canvas.width = state.processedCanvas.width;
    canvas.height = state.processedCanvas.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(state.processedCanvas, 0, 0);
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imgData.data;

    var bw = canvas.width;
    var bh = canvas.height;
    var mask = state.brushMask;
    if (!mask) return;

    var sx = w / bw;
    var sy = h / bh;

    for (var p = 0; p < bw * bh; p++) {
      var val = mask[p];
      if (val === 0) continue;
      var i = p * 4;

      if (val > 0) {
        var origX = Math.min(w - 1, Math.floor((p % bw) * sx));
        var origY = Math.min(h - 1, Math.floor(Math.floor(p / bw) * sy));
        var oi = (origY * w + origX) * 4;
        var factor = Math.min(1, Math.abs(val));
        data[i]     = Math.round(data[i]     + (srcData[oi]     - data[i]) * factor);
        data[i + 1] = Math.round(data[i + 1] + (srcData[oi + 1] - data[i + 1]) * factor);
        data[i + 2] = Math.round(data[i + 2] + (srcData[oi + 2] - data[i + 2]) * factor);
        data[i + 3] = Math.round(data[i + 3] + (srcData[oi + 3] - data[i + 3]) * factor);
      } else {
        var factor2 = Math.min(1, Math.abs(val));
        data[i + 3] = Math.round(data[i + 3] * (1 - factor2));
      }
    }

    ctx.putImageData(imgData, 0, 0);

    var display = document.createElement('canvas');
    display.width = canvas.width;
    display.height = canvas.height;
    display.style.maxWidth = '100%';
    display.style.maxHeight = '500px';
    display.style.objectFit = 'contain';
    var dctx = display.getContext('2d');
    dctx.drawImage(canvas, 0, 0);
    dom.processedLayer.innerHTML = '';
    dom.processedLayer.appendChild(display);

    state._brushedCanvas = canvas;
  },

  buildEdgeFloodMask: function(srcData, w, h, bgRgb, bgThreshold) {
    var totalPixels = w * h;
    var maxDist = bgThreshold * 2.5;

    var visited = new Uint8Array(totalPixels);
    var mask = new Float32Array(totalPixels);
    mask.fill(1.0);

    function pixelDist(p) {
      var i = p * 4;
      var a = srcData[i + 3];
      if (a < 10) return -1;
      var dr = srcData[i] - bgRgb.r;
      var dg = srcData[i + 1] - bgRgb.g;
      var db = srcData[i + 2] - bgRgb.b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function isBgPixel(p) {
      var d = pixelDist(p);
      return d < 0 || d < maxDist;
    }

    function getBgFactor(p) {
      var d = pixelDist(p);
      if (d < 0) return 0.0;
      if (d >= maxDist) return 1.0;
      return d / maxDist;
    }

    function bfsFlood(seeds) {
      var queue = seeds;
      var head = 0;
      while (head < queue.length) {
        var p = queue[head++];
        mask[p] = getBgFactor(p);

        var x = p % w;
        var y = (p - x) / w;

        if (x > 0)     { var np = p - 1; if (!visited[np]) { if (isBgPixel(np)) { visited[np] = 1; queue.push(np); } else { visited[np] = 2; } } }
        if (x < w - 1) { var np2 = p + 1; if (!visited[np2]) { if (isBgPixel(np2)) { visited[np2] = 1; queue.push(np2); } else { visited[np2] = 2; } } }
        if (y > 0)     { var np3 = p - w; if (!visited[np3]) { if (isBgPixel(np3)) { visited[np3] = 1; queue.push(np3); } else { visited[np3] = 2; } } }
        if (y < h - 1) { var np4 = p + w; if (!visited[np4]) { if (isBgPixel(np4)) { visited[np4] = 1; queue.push(np4); } else { visited[np4] = 2; } } }
      }
      return queue.length;
    }

    // Pass 1: Flood from edges
    var edgeSeeds = [];
    for (var x = 0; x < w; x++) {
      var top = x, bot = (h - 1) * w + x;
      if (isBgPixel(top) && !visited[top]) { visited[top] = 1; edgeSeeds.push(top); }
      if (isBgPixel(bot) && !visited[bot]) { visited[bot] = 1; edgeSeeds.push(bot); }
    }
    for (var y = 1; y < h - 1; y++) {
      var left = y * w, right = y * w + (w - 1);
      if (isBgPixel(left)  && !visited[left])  { visited[left]  = 1; edgeSeeds.push(left); }
      if (isBgPixel(right) && !visited[right]) { visited[right] = 1; edgeSeeds.push(right); }
    }
    bfsFlood(edgeSeeds);

    // Pass 2: Find interior holes
    var minHoleSize = Math.max(20, totalPixels * 0.0002);

    for (var p = 0; p < totalPixels; p++) {
      if (visited[p] !== 0) continue;
      if (!isBgPixel(p)) { visited[p] = 2; continue; }

      var region = [p];
      visited[p] = 1;
      var rHead = 0;
      while (rHead < region.length) {
        var rp = region[rHead++];
        var rx = rp % w;
        var ry = (rp - rx) / w;
        var nbs = [];
        if (rx > 0)     nbs.push(rp - 1);
        if (rx < w - 1) nbs.push(rp + 1);
        if (ry > 0)     nbs.push(rp - w);
        if (ry < h - 1) nbs.push(rp + w);
        for (var ni = 0; ni < nbs.length; ni++) {
          var np5 = nbs[ni];
          if (visited[np5] === 0) {
            if (isBgPixel(np5)) {
              visited[np5] = 1;
              region.push(np5);
            } else {
              visited[np5] = 2;
            }
          }
        }
      }

      if (region.length >= minHoleSize) {
        for (var ri = 0; ri < region.length; ri++) {
          mask[region[ri]] = getBgFactor(region[ri]);
        }
      } else {
        for (var ri2 = 0; ri2 < region.length; ri2++) {
          mask[region[ri2]] = 1.0;
        }
      }
    }

    return mask;
  },

  erodeMask: function(mask, w, h, radius) {
    if (radius <= 0) return mask;
    var totalPixels = w * h;
    var out = new Float32Array(mask);

    for (var pass = 0; pass < radius; pass++) {
      var boundary = [];
      for (var p = 0; p < totalPixels; p++) {
        if (out[p] >= 1.0) continue;
        var x = p % w;
        var y = (p - x) / w;
        var nearFg = false;
        if (x > 0     && out[p - 1] >= 1.0) nearFg = true;
        if (x < w - 1 && out[p + 1] >= 1.0) nearFg = true;
        if (y > 0     && out[p - w] >= 1.0) nearFg = true;
        if (y < h - 1 && out[p + w] >= 1.0) nearFg = true;
        if (nearFg) boundary.push(p);
      }
      for (var bi = 0; bi < boundary.length; bi++) {
        out[boundary[bi]] = 1.0;
      }
    }

    return out;
  },

  renderOriginalRaster: function() {
    var state = App.state;
    var dom = App.dom;
    var display = document.createElement('canvas');
    display.width = state.originalCanvas.width;
    display.height = state.originalCanvas.height;
    display.style.maxWidth = '100%';
    display.style.maxHeight = '500px';
    display.style.objectFit = 'contain';
    var ctx = display.getContext('2d');
    ctx.drawImage(state.originalCanvas, 0, 0);
    dom.originalLayer.innerHTML = '';
    dom.originalLayer.appendChild(display);
    var sizer = document.createElement('canvas');
    sizer.width = display.width;
    sizer.height = display.height;
    sizer.style.maxWidth = '100%';
    sizer.style.maxHeight = '500px';
    sizer.style.objectFit = 'contain';
    sizer.getContext('2d').drawImage(state.originalCanvas, 0, 0);
    dom.comparisonSizer.innerHTML = '';
    dom.comparisonSizer.appendChild(sizer);
  },

  applyRasterProcessing: function() {
    var state = App.state;
    if (!state.originalData) return;

    _currentRunId++;
    var thisRunId = _currentRunId;
    state.processing = false;
    state._brushedCanvas = null;

    var src = state.originalData;
    var w = src.width;
    var h = src.height;
    var totalPixels = w * h;
    var srcData = src.data;

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var output = ctx.createImageData(w, h);
    var outData = output.data;

    outData.set(srcData);

    var hasColorReplace = state.selectedSourceColor && state.targetColor;
    var sourceRgb = hasColorReplace ? App.utils.hexToRgb(state.selectedSourceColor) : null;
    var targetRgb = hasColorReplace ? App.utils.hexToRgb(state.targetColor) : null;
    var tolerance = state.tolerance;
    var doBgRemoval = state.bgRemoval;
    var bgThreshold = state.bgThreshold;
    var bgRgb = doBgRemoval ? App.utils.hexToRgb(state.bgRemovalColor) : null;

    if (!hasColorReplace && !doBgRemoval && !state.upscale) {
      ctx.putImageData(output, 0, 0);
      state.processedCanvas = canvas;
      state._colorOnlyCanvas = null;
      state._bgOnlyCanvas = null;
      state._preUpscaleCanvas = canvas;
      App.bgRemoval.renderProcessedRaster(canvas);
      return;
    }

    state.processing = true;

    var bgMask = null;
    if (doBgRemoval) {
      App.utils.showProgress(10, 'Detecting background...');
      bgMask = App.bgRemoval.buildEdgeFloodMask(srcData, w, h, bgRgb, bgThreshold);
      if (state.edgeProtect > 0) {
        App.utils.showProgress(15, 'Protecting edges...');
        bgMask = App.bgRemoval.erodeMask(bgMask, w, h, state.edgeProtect);
      }
    }

    var CHUNK = 50000;
    var idx = 0;

    function processChunk() {
      if (thisRunId !== _currentRunId) return;

      var end = Math.min(idx + CHUNK, totalPixels);
      for (var p = idx; p < end; p++) {
        var i = p * 4;
        var r = srcData[i], g = srcData[i+1], b = srcData[i+2], a = srcData[i+3];

        if (doBgRemoval && bgMask && a > 0) {
          var keepFactor = bgMask[p];
          if (keepFactor < 1.0) {
            a = Math.round(a * keepFactor);
            if (a > 0 && keepFactor < 1.0) {
              var correction = Math.min(1, keepFactor + 0.1);
              if (correction > 0) {
                r = Math.min(255, Math.max(0, Math.round(r / correction)));
                g = Math.min(255, Math.max(0, Math.round(g / correction)));
                b = Math.min(255, Math.max(0, Math.round(b / correction)));
              }
            }
          }
        }

        if (hasColorReplace && a > 0) {
          var dist = Math.sqrt((r - sourceRgb.r)**2 + (g - sourceRgb.g)**2 + (b - sourceRgb.b)**2);
          var maxDist = tolerance * 1.5;
          if (dist < maxDist) {
            var blend = 1 - (dist / maxDist);
            r = Math.round(r + (targetRgb.r - r) * blend);
            g = Math.round(g + (targetRgb.g - g) * blend);
            b = Math.round(b + (targetRgb.b - b) * blend);
          }
        }

        outData[i] = r;
        outData[i+1] = g;
        outData[i+2] = b;
        outData[i+3] = a;
      }

      idx = end;
      var basePct = doBgRemoval ? 20 : 0;
      var rangePct = doBgRemoval ? 80 : 100;
      var pct = Math.round(basePct + (idx / totalPixels) * rangePct);

      if (idx < totalPixels) {
        App.utils.showProgress(pct, 'Processing... ' + pct + '%');
        requestAnimationFrame(processChunk);
      } else {
        ctx.putImageData(output, 0, 0);

        state._colorOnlyCanvas = null;
        state._bgOnlyCanvas = null;
        state._preUpscaleCanvas = null;

        if (hasColorReplace) {
          var cCanvas = document.createElement('canvas');
          cCanvas.width = w; cCanvas.height = h;
          var cCtx = cCanvas.getContext('2d');
          var cImg = cCtx.createImageData(w, h);
          var cData = cImg.data;
          for (var p2 = 0; p2 < totalPixels; p2++) {
            var i2 = p2 * 4;
            var r2 = srcData[i2], g2 = srcData[i2+1], b2 = srcData[i2+2], a2 = srcData[i2+3];
            if (a2 > 0) {
              var dist2 = Math.sqrt((r2 - sourceRgb.r)**2 + (g2 - sourceRgb.g)**2 + (b2 - sourceRgb.b)**2);
              var maxDist2 = tolerance * 1.5;
              if (dist2 < maxDist2) {
                var blend2 = 1 - (dist2 / maxDist2);
                r2 = Math.round(r2 + (targetRgb.r - r2) * blend2);
                g2 = Math.round(g2 + (targetRgb.g - g2) * blend2);
                b2 = Math.round(b2 + (targetRgb.b - b2) * blend2);
              }
            }
            cData[i2] = r2; cData[i2+1] = g2; cData[i2+2] = b2; cData[i2+3] = a2;
          }
          cCtx.putImageData(cImg, 0, 0);
          state._colorOnlyCanvas = cCanvas;
        }

        if (doBgRemoval && bgMask) {
          var bCanvas = document.createElement('canvas');
          bCanvas.width = w; bCanvas.height = h;
          var bCtx = bCanvas.getContext('2d');
          var bImg = bCtx.createImageData(w, h);
          var bData = bImg.data;
          for (var p3 = 0; p3 < totalPixels; p3++) {
            var i3 = p3 * 4;
            var r3 = srcData[i3], g3 = srcData[i3+1], b3 = srcData[i3+2], a3 = srcData[i3+3];
            if (a3 > 0) {
              var keepFactor2 = bgMask[p3];
              if (keepFactor2 < 1.0) {
                a3 = Math.round(a3 * keepFactor2);
                if (a3 > 0) {
                  var correction2 = Math.min(1, keepFactor2 + 0.1);
                  if (correction2 > 0) {
                    r3 = Math.min(255, Math.max(0, Math.round(r3 / correction2)));
                    g3 = Math.min(255, Math.max(0, Math.round(g3 / correction2)));
                    b3 = Math.min(255, Math.max(0, Math.round(b3 / correction2)));
                  }
                }
              }
            }
            bData[i3] = r3; bData[i3+1] = g3; bData[i3+2] = b3; bData[i3+3] = a3;
          }
          bCtx.putImageData(bImg, 0, 0);
          state._bgOnlyCanvas = bCanvas;
        }

        state._preUpscaleCanvas = canvas;

        if (state.upscale) {
          var upscaled = App.upscale.upscaleCanvas(canvas, state.upscaleScale);
          state.processedCanvas = upscaled;
          state.processing = false;
          App.utils.hideProgress();
          App.bgRemoval.renderProcessedRaster(upscaled);
        } else {
          state.processedCanvas = canvas;
          state.processing = false;
          App.utils.hideProgress();
          App.bgRemoval.renderProcessedRaster(canvas);
        }
      }
    }

    if (totalPixels > CHUNK || doBgRemoval) {
      App.utils.showProgress(0, 'Processing...');
    }
    processChunk();
  },

  renderProcessedRaster: function(canvas) {
    var state = App.state;
    var dom = App.dom;
    if (state.compareMode !== 'final') {
      App.comparison.updateComparisonLayers();
      App.download.updateDownloadInfo();
      return;
    }
    var displayW = state.originalCanvas.width;
    var displayH = state.originalCanvas.height;
    var display = document.createElement('canvas');
    display.width = displayW;
    display.height = displayH;
    display.style.maxWidth = '100%';
    display.style.maxHeight = '500px';
    display.style.objectFit = 'contain';
    var ctx = display.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, displayW, displayH);
    dom.processedLayer.innerHTML = '';
    dom.processedLayer.appendChild(display);
    App.download.updateDownloadInfo();
    if (state.brushMask) {
      App.bgRemoval.applyBrushToProcessed();
    }
  },

  isBrushPainting: function() { return _brushPainting; },
  setBrushPainting: function(val) { _brushPainting = val; },
};
