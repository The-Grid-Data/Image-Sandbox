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

  // Push current color state onto undo stack
  pushColorUndo: function() {
    var state = App.state;
    var snapshot = {
      replacements: {},
      selectedSourceColor: state.selectedSourceColor,
      targetColor: state.targetColor
    };
    var key;
    for (key in state.colorReplacements) {
      snapshot.replacements[key] = state.colorReplacements[key];
    }
    state.colorUndoStack.push(snapshot);
    // Cap stack size
    if (state.colorUndoStack.length > 50) {
      state.colorUndoStack.shift();
    }
  },

  // Pop color undo stack and restore state
  undoColor: function() {
    var state = App.state;
    var dom = App.dom;
    if (!state.colorUndoStack.length) return false;
    var snapshot = state.colorUndoStack.pop();
    state.colorReplacements = snapshot.replacements;
    state.selectedSourceColor = snapshot.selectedSourceColor;
    state.targetColor = snapshot.targetColor;
    dom.targetColorInput.value = state.targetColor;
    dom.targetHexInput.value = state.targetColor;
    App.colorDetection.renderSwatches();
    App.colorDetection.updateResetButton();
    App.app.updateBrushToolbar();
    App.app.applyProcessing();
    return true;
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

      // Check mark (shown when selected)
      el.innerHTML = '<span class="swatch-check" style="color:' + checkColor + '">&#10003;</span>';

      // Show mapped indicator if this color has a replacement
      var mappedTarget = state.colorReplacements[hex];
      if (mappedTarget && mappedTarget !== hex) {
        el.classList.add('mapped');
        var dot = document.createElement('span');
        dot.className = 'swatch-mapped-dot';
        dot.style.background = mappedTarget;
        dot.title = 'Mapped to ' + mappedTarget;
        el.appendChild(dot);

        // Remove button (visible on hover)
        var removeBtn = document.createElement('span');
        removeBtn.className = 'swatch-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove this color change';
        removeBtn.addEventListener('click', (function(sourceHex) {
          return function(e) {
            e.stopPropagation();
            App.colorDetection.removeMapping(sourceHex);
          };
        })(hex));
        el.appendChild(removeBtn);
      }

      // Mark selected
      if (hex === state.selectedSourceColor) {
        el.classList.add('selected');
      }

      // Click handler: select or deselect
      el.addEventListener('click', (function(h, e) {
        return function() { App.colorDetection.selectSourceColor(h, e); };
      })(hex, el));

      dom.swatchesEl.appendChild(el);
    }
  },

  selectSourceColor: function(hex, el) {
    var state = App.state;
    var dom = App.dom;

    // Push undo before any change
    App.colorDetection.pushColorUndo();

    // Save current mapping before switching (if there's an active replacement)
    if (state.selectedSourceColor && state.targetColor &&
        state.selectedSourceColor !== state.targetColor) {
      state.colorReplacements[state.selectedSourceColor] = state.targetColor;
    }

    // If clicking the already-selected swatch, deselect it
    if (state.selectedSourceColor === hex) {
      state.selectedSourceColor = null;
      dom.swatchesEl.querySelectorAll('.swatch').forEach(function(s) { s.classList.remove('selected'); });
      App.colorDetection.renderSwatches();
      App.colorDetection.updateResetButton();
      App.app.updateBrushToolbar();
      App.app.applyProcessing();
      return;
    }

    state.selectedSourceColor = hex;
    // Restore previous target if this color was already mapped, otherwise keep current
    if (state.colorReplacements[hex]) {
      state.targetColor = state.colorReplacements[hex];
      dom.targetColorInput.value = state.targetColor;
      dom.targetHexInput.value = state.targetColor;
    }

    // Re-render swatches to update indicators
    App.colorDetection.renderSwatches();
    App.colorDetection.updateResetButton();

    dom.targetColorRow.style.display = '';
    if (state.fileType === 'raster') dom.toleranceRow.style.display = '';
    App.app.updateBrushToolbar();
    App.app.applyProcessing();
  },

  // Remove a single color mapping
  removeMapping: function(sourceHex) {
    var state = App.state;

    // Push undo before removing
    App.colorDetection.pushColorUndo();

    delete state.colorReplacements[sourceHex];

    // If we just removed the currently selected color's mapping, clear selection
    if (state.selectedSourceColor === sourceHex) {
      state.selectedSourceColor = null;
    }

    App.colorDetection.renderSwatches();
    App.colorDetection.updateResetButton();
    App.app.updateBrushToolbar();
    App.app.applyProcessing();
  },

  // Reset all color mappings
  resetAllColors: function() {
    var state = App.state;
    var dom = App.dom;

    // Push undo before reset
    App.colorDetection.pushColorUndo();

    state.colorReplacements = {};
    state.selectedSourceColor = null;
    state.targetColor = '#ffffff';
    dom.targetColorInput.value = '#ffffff';
    dom.targetHexInput.value = '#ffffff';

    App.colorDetection.renderSwatches();
    App.colorDetection.updateResetButton();
    App.app.updateBrushToolbar();
    App.app.applyProcessing();
    App.utils.showToast('All color changes cleared');
  },

  // Show/hide the reset button based on whether there are mappings
  updateResetButton: function() {
    var state = App.state;
    var dom = App.dom;
    var hasMappings = false;
    var key;
    for (key in state.colorReplacements) {
      if (state.colorReplacements[key] !== key) {
        hasMappings = true;
        break;
      }
    }
    dom.btnResetColors.style.display = hasMappings ? '' : 'none';
  },

  highlightSwatch: function(hex) {
    var dom = App.dom;
    dom.swatchesEl.querySelectorAll('.swatch').forEach(function(s) {
      s.classList.toggle('selected', s.title === hex);
    });
  },
};
