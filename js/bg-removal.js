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

    // Dense edge sampling: ~25 samples per edge = ~100 total
    var edgeSamples = [];
    var strideX = Math.max(1, Math.floor(w / 25));
    var strideY = Math.max(1, Math.floor(h / 25));
    // Top and bottom edges
    for (var x = 0; x < w; x += strideX) {
      var iT = x * 4;
      if (data[iT + 3] > 128) edgeSamples.push({ r: data[iT], g: data[iT + 1], b: data[iT + 2] });
      var iB = ((h - 1) * w + x) * 4;
      if (data[iB + 3] > 128) edgeSamples.push({ r: data[iB], g: data[iB + 1], b: data[iB + 2] });
    }
    // Left and right edges
    for (var y = 1; y < h - 1; y += strideY) {
      var iL = (y * w) * 4;
      if (data[iL + 3] > 128) edgeSamples.push({ r: data[iL], g: data[iL + 1], b: data[iL + 2] });
      var iR = (y * w + w - 1) * 4;
      if (data[iR + 3] > 128) edgeSamples.push({ r: data[iR], g: data[iR + 1], b: data[iR + 2] });
    }

    if (edgeSamples.length < 10) {
      // Fallback: average whatever we have
      var rS = 0, gS = 0, bS = 0;
      for (var fi = 0; fi < edgeSamples.length; fi++) {
        rS += edgeSamples[fi].r; gS += edgeSamples[fi].g; bS += edgeSamples[fi].b;
      }
      if (edgeSamples.length > 0) {
        var hex0 = App.utils.rgbToHex(Math.round(rS / edgeSamples.length), Math.round(gS / edgeSamples.length), Math.round(bS / edgeSamples.length));
        state.bgRemovalColor = hex0;
        dom.bgRemovalColorInput.value = hex0;
        dom.bgRemovalHexInput.value = hex0;
        App.utils.showToast('Detected background: ' + hex0, 'success');
      }
      return;
    }

    // K-means clustering (k=3, 5 iterations) to find dominant bg color
    var k = 3;
    var n = edgeSamples.length;
    var centroids = [
      { r: edgeSamples[0].r, g: edgeSamples[0].g, b: edgeSamples[0].b },
      { r: edgeSamples[Math.floor(n / 3)].r, g: edgeSamples[Math.floor(n / 3)].g, b: edgeSamples[Math.floor(n / 3)].b },
      { r: edgeSamples[Math.floor(2 * n / 3)].r, g: edgeSamples[Math.floor(2 * n / 3)].g, b: edgeSamples[Math.floor(2 * n / 3)].b }
    ];
    var assignments = new Array(n);

    for (var iter = 0; iter < 5; iter++) {
      // Assign each sample to nearest centroid
      for (var si = 0; si < n; si++) {
        var s = edgeSamples[si];
        var bestC = 0, bestD = Infinity;
        for (var ci = 0; ci < k; ci++) {
          var c = centroids[ci];
          var dd = (s.r - c.r) * (s.r - c.r) + (s.g - c.g) * (s.g - c.g) + (s.b - c.b) * (s.b - c.b);
          if (dd < bestD) { bestD = dd; bestC = ci; }
        }
        assignments[si] = bestC;
      }
      // Recompute centroids
      for (var ci2 = 0; ci2 < k; ci2++) {
        var rA = 0, gA = 0, bA = 0, cnt = 0;
        for (var si2 = 0; si2 < n; si2++) {
          if (assignments[si2] === ci2) {
            rA += edgeSamples[si2].r; gA += edgeSamples[si2].g; bA += edgeSamples[si2].b; cnt++;
          }
        }
        if (cnt > 0) {
          centroids[ci2] = { r: rA / cnt, g: gA / cnt, b: bA / cnt };
        }
      }
    }

    // Pick cluster with most members
    var clusterCounts = [0, 0, 0];
    for (var ai = 0; ai < n; ai++) clusterCounts[assignments[ai]]++;
    var bestCluster = 0;
    if (clusterCounts[1] > clusterCounts[bestCluster]) bestCluster = 1;
    if (clusterCounts[2] > clusterCounts[bestCluster]) bestCluster = 2;

    var winner = centroids[bestCluster];
    var hex = App.utils.rgbToHex(Math.round(winner.r), Math.round(winner.g), Math.round(winner.b));
    state.bgRemovalColor = hex;
    dom.bgRemovalColorInput.value = hex;
    dom.bgRemovalHexInput.value = hex;
    App.utils.showToast('Detected background: ' + hex, 'success');
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

  // Compute Sobel edge strength map — returns Float32Array of normalized gradient magnitudes [0..1]
  computeEdgeStrength: function(srcData, w, h) {
    var totalPixels = w * h;
    var gray = new Float32Array(totalPixels);
    // Convert to grayscale
    for (var p = 0; p < totalPixels; p++) {
      var i = p * 4;
      gray[p] = (srcData[i] * 0.299 + srcData[i + 1] * 0.587 + srcData[i + 2] * 0.114) / 255;
    }
    var edgeMap = new Float32Array(totalPixels);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = y * w + x;
        // Sobel X kernel
        var gx = -gray[idx - w - 1] + gray[idx - w + 1]
               - 2 * gray[idx - 1] + 2 * gray[idx + 1]
               - gray[idx + w - 1] + gray[idx + w + 1];
        // Sobel Y kernel
        var gy = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
               + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
        edgeMap[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    // Normalize to [0..1]
    var maxVal = 0;
    for (var e = 0; e < totalPixels; e++) {
      if (edgeMap[e] > maxVal) maxVal = edgeMap[e];
    }
    if (maxVal > 0) {
      for (var e2 = 0; e2 < totalPixels; e2++) {
        edgeMap[e2] /= maxVal;
      }
    }
    return edgeMap;
  },

  // Sample edge pixels to compute adaptive threshold
  computeAdaptiveThreshold: function(srcData, w, h, bgRgb, baseThreshold) {
    var distances = [];
    var step = Math.max(1, Math.floor(w / 50));
    // Sample top/bottom edges
    for (var x = 0; x < w; x += step) {
      var iTop = x * 4;
      var iBot = ((h - 1) * w + x) * 4;
      if (srcData[iTop + 3] > 128) {
        var dr = srcData[iTop] - bgRgb.r;
        var dg = srcData[iTop + 1] - bgRgb.g;
        var db = srcData[iTop + 2] - bgRgb.b;
        distances.push(Math.sqrt(dr * dr + dg * dg + db * db));
      }
      if (srcData[iBot + 3] > 128) {
        var dr2 = srcData[iBot] - bgRgb.r;
        var dg2 = srcData[iBot + 1] - bgRgb.g;
        var db2 = srcData[iBot + 2] - bgRgb.b;
        distances.push(Math.sqrt(dr2 * dr2 + dg2 * dg2 + db2 * db2));
      }
    }
    // Sample left/right edges
    var stepY = Math.max(1, Math.floor(h / 50));
    for (var y = 0; y < h; y += stepY) {
      var iLeft = (y * w) * 4;
      var iRight = (y * w + w - 1) * 4;
      if (srcData[iLeft + 3] > 128) {
        var dr3 = srcData[iLeft] - bgRgb.r;
        var dg3 = srcData[iLeft + 1] - bgRgb.g;
        var db3 = srcData[iLeft + 2] - bgRgb.b;
        distances.push(Math.sqrt(dr3 * dr3 + dg3 * dg3 + db3 * db3));
      }
      if (srcData[iRight + 3] > 128) {
        var dr4 = srcData[iRight] - bgRgb.r;
        var dg4 = srcData[iRight + 1] - bgRgb.g;
        var db4 = srcData[iRight + 2] - bgRgb.b;
        distances.push(Math.sqrt(dr4 * dr4 + dg4 * dg4 + db4 * db4));
      }
    }
    if (distances.length < 5) return baseThreshold * 2.5;
    // Compute mean and stddev
    var sum = 0;
    for (var di = 0; di < distances.length; di++) sum += distances[di];
    var mean = sum / distances.length;
    var sqSum = 0;
    for (var di2 = 0; di2 < distances.length; di2++) {
      var diff = distances[di2] - mean;
      sqSum += diff * diff;
    }
    var stddev = Math.sqrt(sqSum / distances.length);
    var adaptive = mean + 2 * stddev;
    // Clamp between 1.5x and 4x of base threshold
    var minT = baseThreshold * 1.5;
    var maxT = baseThreshold * 4;
    return Math.max(minT, Math.min(maxT, adaptive));
  },

  // Compute neighbor-to-neighbor color distance along edges to gauge gradient strength
  computeLocalThreshold: function(srcData, w, h, baseThreshold) {
    var neighborDists = [];
    var step = Math.max(1, Math.floor(w / 50));
    var stepY = Math.max(1, Math.floor(h / 50));
    // Top edge: consecutive pairs
    for (var x = step; x < w; x += step) {
      var curr = x * 4;
      var prev = (x - step) * 4;
      if (srcData[curr + 3] > 128 && srcData[prev + 3] > 128) {
        var dr = srcData[curr] - srcData[prev];
        var dg = srcData[curr + 1] - srcData[prev + 1];
        var db = srcData[curr + 2] - srcData[prev + 2];
        neighborDists.push(Math.sqrt(dr * dr + dg * dg + db * db));
      }
    }
    // Bottom edge
    for (var x2 = step; x2 < w; x2 += step) {
      var bCurr = ((h - 1) * w + x2) * 4;
      var bPrev = ((h - 1) * w + x2 - step) * 4;
      if (srcData[bCurr + 3] > 128 && srcData[bPrev + 3] > 128) {
        var dr2 = srcData[bCurr] - srcData[bPrev];
        var dg2 = srcData[bCurr + 1] - srcData[bPrev + 1];
        var db2 = srcData[bCurr + 2] - srcData[bPrev + 2];
        neighborDists.push(Math.sqrt(dr2 * dr2 + dg2 * dg2 + db2 * db2));
      }
    }
    // Left edge
    for (var y = stepY; y < h; y += stepY) {
      var lCurr = (y * w) * 4;
      var lPrev = ((y - stepY) * w) * 4;
      if (srcData[lCurr + 3] > 128 && srcData[lPrev + 3] > 128) {
        var dr3 = srcData[lCurr] - srcData[lPrev];
        var dg3 = srcData[lCurr + 1] - srcData[lPrev + 1];
        var db3 = srcData[lCurr + 2] - srcData[lPrev + 2];
        neighborDists.push(Math.sqrt(dr3 * dr3 + dg3 * dg3 + db3 * db3));
      }
    }
    // Right edge
    for (var y2 = stepY; y2 < h; y2 += stepY) {
      var rCurr = (y2 * w + w - 1) * 4;
      var rPrev = ((y2 - stepY) * w + w - 1) * 4;
      if (srcData[rCurr + 3] > 128 && srcData[rPrev + 3] > 128) {
        var dr4 = srcData[rCurr] - srcData[rPrev];
        var dg4 = srcData[rCurr + 1] - srcData[rPrev + 1];
        var db4 = srcData[rCurr + 2] - srcData[rPrev + 2];
        neighborDists.push(Math.sqrt(dr4 * dr4 + dg4 * dg4 + db4 * db4));
      }
    }
    if (neighborDists.length < 5) return baseThreshold * 1.2;
    var nSum = 0;
    for (var ni = 0; ni < neighborDists.length; ni++) nSum += neighborDists[ni];
    var nMean = nSum / neighborDists.length;
    var nSqSum = 0;
    for (var ni2 = 0; ni2 < neighborDists.length; ni2++) {
      var nd = neighborDists[ni2] - nMean;
      nSqSum += nd * nd;
    }
    var nStddev = Math.sqrt(nSqSum / neighborDists.length);
    var localT = nMean + 2 * nStddev;
    // Clamp to reasonable range around baseThreshold
    var loT = baseThreshold * 0.5;
    var hiT = baseThreshold * 2.0;
    return Math.max(loT, Math.min(hiT, localT));
  },

  // Suppress color spill on boundary pixels by blending toward nearest foreground
  suppressColorSpill: function(outData, mask, srcData, w, h, bgRgb) {
    var totalPixels = w * h;
    for (var p = 0; p < totalPixels; p++) {
      var keepFactor = mask[p];
      if (keepFactor <= 0.1 || keepFactor >= 0.95) continue;
      var i = p * 4;
      if (outData[i + 3] < 10) continue;

      // Find nearest foreground pixel within 3px radius
      var px = p % w;
      var py = (p - px) / w;
      var bestR = -1, bestG = -1, bestB = -1;
      var bestDist = 100;
      var searchR = 3;
      for (var dy = -searchR; dy <= searchR; dy++) {
        var ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (var dx = -searchR; dx <= searchR; dx++) {
          var nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          var np = ny * w + nx;
          if (mask[np] >= 0.95) {
            var d = Math.abs(dx) + Math.abs(dy);
            if (d < bestDist) {
              bestDist = d;
              var ni = np * 4;
              bestR = srcData[ni];
              bestG = srcData[ni + 1];
              bestB = srcData[ni + 2];
            }
          }
        }
      }

      if (bestR < 0) continue;

      // Compute how "boundary" this pixel is (0 at edges of range, 1 at center)
      var boundaryStrength = 1 - Math.abs(keepFactor - 0.5) * 2;
      // Max 60% shift, proportional to boundary strength
      var shift = boundaryStrength * 0.6;
      outData[i]     = Math.round(outData[i]     + (bestR - outData[i]) * shift);
      outData[i + 1] = Math.round(outData[i + 1] + (bestG - outData[i + 1]) * shift);
      outData[i + 2] = Math.round(outData[i + 2] + (bestB - outData[i + 2]) * shift);
    }
  },

  buildEdgeFloodMask: function(srcData, w, h, bgRgb, bgThreshold, edgeMap) {
    var totalPixels = w * h;
    var maxDist = App.bgRemoval.computeAdaptiveThreshold(srcData, w, h, bgRgb, bgThreshold);
    var localThreshold = App.bgRemoval.computeLocalThreshold(srcData, w, h, bgThreshold);
    var globalCeiling = maxDist * 2.5;

    var visited = new Uint8Array(totalPixels);
    var mask = new Float32Array(totalPixels);
    mask.fill(1.0);

    // Parent index for local-neighbor comparison (-1 = seed/no parent)
    var parentIdx = new Int32Array(totalPixels);
    for (var pi = 0; pi < totalPixels; pi++) parentIdx[pi] = -1;

    function globalDist(p) {
      var i = p * 4;
      if (srcData[i + 3] < 10) return -1;
      var dr = srcData[i] - bgRgb.r;
      var dg = srcData[i + 1] - bgRgb.g;
      var db = srcData[i + 2] - bgRgb.b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function localDist(p, parent) {
      var i = p * 4;
      var j = parent * 4;
      var dr = srcData[i] - srcData[j];
      var dg = srcData[i + 1] - srcData[j + 1];
      var db = srcData[i + 2] - srcData[j + 2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    // Dual test: global OR local, with ceiling
    function isBgCandidate(p, parentP) {
      var gd = globalDist(p);
      if (gd < 0) return true;           // transparent = bg
      if (gd > globalCeiling) return false; // too far, hard stop
      if (gd < maxDist) return true;      // close to global bg
      // Local test: similar to BFS parent (gradient following)
      if (parentP >= 0) {
        var ld = localDist(p, parentP);
        if (ld < localThreshold) return true;
      }
      return false;
    }

    // Seeds use global test only (no parent)
    function isBgSeed(p) {
      var gd = globalDist(p);
      return gd < 0 || gd < maxDist;
    }

    function getBgFactor(p, parentP) {
      var gd = globalDist(p);
      if (gd < 0) return 0.0;
      var globalFactor = Math.min(1.0, gd / globalCeiling);
      if (parentP >= 0) {
        var ld = localDist(p, parentP);
        var localFactor = Math.min(1.0, ld / localThreshold);
        return Math.min(globalFactor, localFactor);
      }
      return Math.min(1.0, gd / maxDist);
    }

    function bfsFlood(seeds) {
      var queue = seeds;
      var head = 0;
      while (head < queue.length) {
        var p = queue[head++];
        var pp = parentIdx[p];
        mask[p] = getBgFactor(p, pp);

        var x = p % w;
        var y = (p - x) / w;

        // 8-connected neighbors
        var neighbors = [];
        if (x > 0)                     neighbors.push(p - 1);
        if (x < w - 1)                 neighbors.push(p + 1);
        if (y > 0)                     neighbors.push(p - w);
        if (y < h - 1)                 neighbors.push(p + w);
        if (x > 0 && y > 0)           neighbors.push(p - w - 1);
        if (x < w - 1 && y > 0)       neighbors.push(p - w + 1);
        if (x > 0 && y < h - 1)       neighbors.push(p + w - 1);
        if (x < w - 1 && y < h - 1)   neighbors.push(p + w + 1);
        for (var ni = 0; ni < neighbors.length; ni++) {
          var np = neighbors[ni];
          if (!visited[np]) {
            if (isBgCandidate(np, p)) {
              // Edge map gate: strong edges block unless very close to bg
              if (edgeMap && edgeMap[np] > 0.4) {
                var edgGd = globalDist(np);
                if (edgGd >= 0 && edgGd > maxDist * 0.3) {
                  visited[np] = 2;
                  continue;
                }
              }
              parentIdx[np] = p;
              visited[np] = 1;
              queue.push(np);
            } else {
              visited[np] = 2;
            }
          }
        }
      }
      return queue.length;
    }

    // Pass 1: Flood from edges (seeds use global test only)
    var edgeSeeds = [];
    for (var x = 0; x < w; x++) {
      var top = x, bot = (h - 1) * w + x;
      if (isBgSeed(top) && !visited[top]) { visited[top] = 1; edgeSeeds.push(top); }
      if (isBgSeed(bot) && !visited[bot]) { visited[bot] = 1; edgeSeeds.push(bot); }
    }
    for (var y = 1; y < h - 1; y++) {
      var left = y * w, right = y * w + (w - 1);
      if (isBgSeed(left)  && !visited[left])  { visited[left]  = 1; edgeSeeds.push(left); }
      if (isBgSeed(right) && !visited[right]) { visited[right] = 1; edgeSeeds.push(right); }
    }
    bfsFlood(edgeSeeds);

    // Pass 2: Find interior bg holes
    var minHoleSize = Math.max(20, totalPixels * 0.0002);

    for (var p2 = 0; p2 < totalPixels; p2++) {
      if (visited[p2] !== 0) continue;
      if (!isBgSeed(p2)) { visited[p2] = 2; continue; }

      var region = [p2];
      visited[p2] = 1;
      parentIdx[p2] = -1;
      var rHead = 0;
      while (rHead < region.length) {
        var rp = region[rHead++];
        var rx = rp % w;
        var ry = (rp - rx) / w;
        var nbs = [];
        if (rx > 0)                       nbs.push(rp - 1);
        if (rx < w - 1)                   nbs.push(rp + 1);
        if (ry > 0)                       nbs.push(rp - w);
        if (ry < h - 1)                   nbs.push(rp + w);
        if (rx > 0 && ry > 0)            nbs.push(rp - w - 1);
        if (rx < w - 1 && ry > 0)        nbs.push(rp - w + 1);
        if (rx > 0 && ry < h - 1)        nbs.push(rp + w - 1);
        if (rx < w - 1 && ry < h - 1)    nbs.push(rp + w + 1);
        for (var ni2 = 0; ni2 < nbs.length; ni2++) {
          var np5 = nbs[ni2];
          if (visited[np5] === 0) {
            if (isBgCandidate(np5, rp)) {
              parentIdx[np5] = rp;
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
          var rip = region[ri];
          mask[rip] = getBgFactor(rip, parentIdx[rip]);
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

  // Separable Gaussian blur on the mask to feather edges
  blurMask: function(mask, w, h, radius) {
    if (radius <= 0) return mask;
    var totalPixels = w * h;
    var temp = new Float32Array(totalPixels);
    var out = new Float32Array(totalPixels);

    // Build 1D Gaussian kernel
    var size = radius * 2 + 1;
    var kernel = new Float32Array(size);
    var sigma = radius / 2.5;
    var sum = 0;
    for (var ki = 0; ki < size; ki++) {
      var d = ki - radius;
      kernel[ki] = Math.exp(-(d * d) / (2 * sigma * sigma));
      sum += kernel[ki];
    }
    for (var ki2 = 0; ki2 < size; ki2++) kernel[ki2] /= sum;

    // Horizontal pass
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var val = 0;
        for (var k = -radius; k <= radius; k++) {
          var sx = Math.min(w - 1, Math.max(0, x + k));
          val += mask[y * w + sx] * kernel[k + radius];
        }
        temp[y * w + x] = val;
      }
    }

    // Vertical pass
    for (var x2 = 0; x2 < w; x2++) {
      for (var y2 = 0; y2 < h; y2++) {
        var val2 = 0;
        for (var k2 = -radius; k2 <= radius; k2++) {
          var sy = Math.min(h - 1, Math.max(0, y2 + k2));
          val2 += temp[sy * w + x2] * kernel[k2 + radius];
        }
        out[y2 * w + x2] = val2;
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

    // Build list of all color replacements (accumulated + current)
    var replacements = {};
    var key;
    for (key in state.colorReplacements) {
      if (state.colorReplacements.hasOwnProperty(key)) {
        replacements[key] = state.colorReplacements[key];
      }
    }
    // Include current active selection
    if (state.selectedSourceColor && state.targetColor) {
      replacements[state.selectedSourceColor] = state.targetColor;
    }
    // Build pre-computed RGB arrays for all replacements
    var colorPairs = [];
    for (key in replacements) {
      if (replacements.hasOwnProperty(key) && key !== replacements[key]) {
        colorPairs.push({
          src: App.utils.hexToRgb(key),
          tgt: App.utils.hexToRgb(replacements[key])
        });
      }
    }
    var hasColorReplace = colorPairs.length > 0;
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

    // Build background mask (algorithmic flood-fill)
    function buildMaskPromise() {
      if (!doBgRemoval) return Promise.resolve(null);
      return Promise.resolve(buildAlgorithmicMask());
    }

    function buildAlgorithmicMask() {
      App.utils.showProgress(5, 'Analyzing edges...');
      var edgeMap = App.bgRemoval.computeEdgeStrength(srcData, w, h);
      App.utils.showProgress(10, 'Detecting background...');
      var mask = App.bgRemoval.buildEdgeFloodMask(srcData, w, h, bgRgb, bgThreshold, edgeMap);
      if (state.edgeProtect > 0) {
        App.utils.showProgress(15, 'Protecting edges...');
        mask = App.bgRemoval.erodeMask(mask, w, h, state.edgeProtect);
      }
      App.utils.showProgress(18, 'Smoothing edges...');
      mask = App.bgRemoval.blurMask(mask, w, h, 2);
      return mask;
    }

    buildMaskPromise().then(function(bgMask) {
    if (thisRunId !== _currentRunId) return;

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
          }
        }

        if (hasColorReplace && a > 0) {
          var maxDist = tolerance * 1.5;
          for (var ci = 0; ci < colorPairs.length; ci++) {
            var cp = colorPairs[ci];
            var dist = Math.sqrt((r - cp.src.r)**2 + (g - cp.src.g)**2 + (b - cp.src.b)**2);
            if (dist < maxDist) {
              var blend = 1 - (dist / maxDist);
              r = Math.round(r + (cp.tgt.r - r) * blend);
              g = Math.round(g + (cp.tgt.g - g) * blend);
              b = Math.round(b + (cp.tgt.b - b) * blend);
              break; // first match wins
            }
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
        // Apply color spill suppression on boundary pixels
        if (doBgRemoval && bgMask) {
          App.bgRemoval.suppressColorSpill(outData, bgMask, srcData, w, h, bgRgb);
        }

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
              var maxDist2 = tolerance * 1.5;
              for (var ci2 = 0; ci2 < colorPairs.length; ci2++) {
                var cp2 = colorPairs[ci2];
                var dist2 = Math.sqrt((r2 - cp2.src.r)**2 + (g2 - cp2.src.g)**2 + (b2 - cp2.src.b)**2);
                if (dist2 < maxDist2) {
                  var blend2 = 1 - (dist2 / maxDist2);
                  r2 = Math.round(r2 + (cp2.tgt.r - r2) * blend2);
                  g2 = Math.round(g2 + (cp2.tgt.g - g2) * blend2);
                  b2 = Math.round(b2 + (cp2.tgt.b - b2) * blend2);
                  break;
                }
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
          App.utils.showToast('Upscaled to ' + upscaled.width + '\u00d7' + upscaled.height + ' (' + state.upscaleScale + 'x)', 'success');
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

    }); // end buildMaskPromise().then()
  },

  renderProcessedRaster: function(canvas) {
    var state = App.state;
    var dom = App.dom;
    if (state.compareMode !== 'final') {
      App.comparison.updateComparisonLayers();
      App.download.updateDownloadInfo();
      App.bgRemoval.updateDimensionBadge();
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
    App.bgRemoval.updateDimensionBadge();
    if (state.brushMask) {
      App.bgRemoval.applyBrushToProcessed();
    }
  },

  updateDimensionBadge: function() {
    var state = App.state;
    var dom = App.dom;
    if (!dom.dimensionBadge) return;
    if (state.upscale && state.processedCanvas) {
      var pw = state.processedCanvas.width;
      var ph = state.processedCanvas.height;
      dom.dimensionBadge.textContent = pw + '\u00d7' + ph + ' (' + state.upscaleScale + 'x)';
      dom.dimensionBadge.style.display = 'block';
    } else {
      dom.dimensionBadge.style.display = 'none';
    }
  },

  isBrushPainting: function() { return _brushPainting; },
  setBrushPainting: function(val) { _brushPainting = val; },
};
