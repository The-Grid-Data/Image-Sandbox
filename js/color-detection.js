// js/color-detection.js — Color detection and swatch rendering
'use strict';

App.colorDetection = {
  detectSVGColors: function() {
    var state = App.state;
    var colors = new Map();
    var svgEl = state.svgDoc.documentElement;

    function walkNode(node) {
      if (node.nodeType !== 1) return;
      var attrs = ['fill', 'stroke'];
      for (var ai = 0; ai < attrs.length; ai++) {
        var attr = attrs[ai];
        var val = node.getAttribute(attr);
        if (!val && node.style && node.style[attr]) val = node.style[attr];
        if (val && val !== 'none' && val !== 'transparent' && val !== 'inherit' && val !== 'currentColor') {
          var hex = App.utils.normalizeColor(val);
          if (hex) colors.set(hex, (colors.get(hex) || 0) + 1);
        }
      }
      var style = node.getAttribute('style');
      if (style) {
        var fillMatch = style.match(/fill\s*:\s*([^;]+)/i);
        var strokeMatch = style.match(/stroke\s*:\s*([^;]+)/i);
        if (fillMatch) { var h = App.utils.normalizeColor(fillMatch[1].trim()); if (h) colors.set(h, (colors.get(h) || 0) + 1); }
        if (strokeMatch) { var h2 = App.utils.normalizeColor(strokeMatch[1].trim()); if (h2) colors.set(h2, (colors.get(h2) || 0) + 1); }
      }
      for (var ci = 0; ci < node.children.length; ci++) walkNode(node.children[ci]);
    }

    var styleEls = svgEl.querySelectorAll('style');
    for (var si = 0; si < styleEls.length; si++) {
      var sEl = styleEls[si];
      var matches = sEl.textContent.matchAll(/(fill|stroke)\s*:\s*([^;}\s]+)/gi);
      for (var m of matches) {
        var h3 = App.utils.normalizeColor(m[2].trim());
        if (h3) colors.set(h3, (colors.get(h3) || 0) + 1);
      }
    }

    walkNode(svgEl);

    state.detectedColors = Array.from(colors.entries())
      .sort(function(a, b) { return b[1] - a[1]; })
      .map(function(e) { return e[0]; });

    App.colorDetection.renderSwatches();
  },

  detectRasterColors: function() {
    var state = App.state;
    var data = state.originalData.data;
    var w = state.originalData.width;
    var h = state.originalData.height;
    var colorCounts = new Map();

    var step = Math.max(1, Math.floor((w * h) / 10000));
    for (var i = 0; i < data.length; i += step * 4) {
      var a = data[i + 3];
      if (a < 128) continue;
      var r = Math.round(data[i] / 16) * 16;
      var g = Math.round(data[i + 1] / 16) * 16;
      var b = Math.round(data[i + 2] / 16) * 16;
      var key = App.utils.rgbToHex(Math.min(r, 255), Math.min(g, 255), Math.min(b, 255));
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    var sorted = Array.from(colorCounts.entries()).sort(function(a, b) { return b[1] - a[1]; });
    var clusters = [];
    var used = new Set();

    for (var si = 0; si < sorted.length; si++) {
      var hex = sorted[si][0];
      var count = sorted[si][1];
      if (used.has(hex)) continue;
      var rgb = App.utils.hexToRgb(hex);
      var merged = false;
      for (var ci = 0; ci < clusters.length; ci++) {
        var dist = App.utils.colorDistance(rgb, clusters[ci].rgb);
        if (dist < 40) {
          clusters[ci].count += count;
          used.add(hex);
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({ hex: hex, rgb: rgb, count: count });
        used.add(hex);
      }
      if (clusters.length >= 20) break;
    }

    clusters.sort(function(a, b) { return b.count - a.count; });
    state.detectedColors = clusters.slice(0, 12).map(function(c) { return c.hex; });
    App.colorDetection.renderSwatches();
  },

  renderSwatches: function() {
    var state = App.state;
    var dom = App.dom;
    dom.swatchesEl.innerHTML = '';
    if (!state.detectedColors.length) {
      dom.swatchesSection.style.display = 'none';
      return;
    }
    dom.swatchesSection.style.display = '';
    for (var di = 0; di < state.detectedColors.length; di++) {
      var hex = state.detectedColors[di];
      var el = document.createElement('div');
      el.className = 'swatch';
      el.style.background = hex;
      el.title = hex;
      var lum = App.utils.luminance(App.utils.hexToRgb(hex));
      var checkColor = lum > 0.5 ? '#000' : '#fff';
      el.innerHTML = '<span class="swatch-check" style="color:' + checkColor + '">&#10003;</span>';
      el.addEventListener('click', (function(h, e) {
        return function() { App.colorDetection.selectSourceColor(h, e); };
      })(hex, el));
      dom.swatchesEl.appendChild(el);
    }
  },

  selectSourceColor: function(hex, el) {
    var state = App.state;
    var dom = App.dom;
    state.selectedSourceColor = hex;
    dom.swatchesEl.querySelectorAll('.swatch').forEach(function(s) { s.classList.remove('selected'); });
    el.classList.add('selected');
    dom.targetColorRow.style.display = '';
    if (state.fileType === 'raster') dom.toleranceRow.style.display = '';
    App.app.applyProcessing();
  },

  highlightSwatch: function(hex) {
    var dom = App.dom;
    dom.swatchesEl.querySelectorAll('.swatch').forEach(function(s) {
      s.classList.toggle('selected', s.title === hex);
    });
  },
};
