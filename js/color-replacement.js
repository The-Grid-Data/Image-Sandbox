// js/color-replacement.js — SVG color replacement and rendering
'use strict';

App.colorReplacement = {
  renderOriginalSVG: function() {
    var state = App.state;
    var dom = App.dom;
    var svgStr = state.svgSource;
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var img = document.createElement('img');
    img.src = url;
    img.className = 'svg-preview';
    dom.originalLayer.innerHTML = '';
    dom.originalLayer.appendChild(img);
    var sizer = document.createElement('img');
    sizer.src = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
    sizer.className = 'svg-preview';
    sizer.onload = function() { URL.revokeObjectURL(sizer.src); };
    dom.comparisonSizer.innerHTML = '';
    dom.comparisonSizer.appendChild(sizer);
    img.onload = function() { URL.revokeObjectURL(url); };
  },

  applySVGProcessing: function() {
    var state = App.state;
    var dom = App.dom;
    var clone = state.svgDoc.documentElement.cloneNode(true);

    // Apply all accumulated color replacements
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
    for (key in replacements) {
      if (replacements.hasOwnProperty(key) && key !== replacements[key]) {
        App.colorReplacement.replaceSVGColors(clone, key, replacements[key]);
      }
    }

    if (state.bgRemoval) {
      App.colorReplacement.removeSVGBackgrounds(clone);
    }

    var serializer = new XMLSerializer();
    var svgStr = serializer.serializeToString(clone);
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var img = document.createElement('img');
    img.src = url;
    img.className = 'svg-preview';
    img.onload = function() { URL.revokeObjectURL(url); };
    dom.processedLayer.innerHTML = '';
    dom.processedLayer.appendChild(img);

    state._processedSVG = svgStr;
    App.download.updateDownloadInfo();
    // Refresh icon preview when SVG content changes
    if (App.state.canvasMode === 'icon' && App.canvasExport) {
      App.canvasExport._refreshPreviewImg();
    }
  },

  replaceSVGColors: function(node, source, target) {
    if (node.nodeType !== 1) return;

    var attrs = ['fill', 'stroke'];
    for (var ai = 0; ai < attrs.length; ai++) {
      var attr = attrs[ai];
      var val = node.getAttribute(attr);
      if (val) {
        var normalized = App.utils.normalizeColor(val);
        if (normalized === source) node.setAttribute(attr, target);
      }
    }

    var style = node.getAttribute('style');
    if (style) {
      var newStyle = style;
      newStyle = newStyle.replace(/(fill\s*:\s*)([^;]+)/gi, function(match, prefix, val) {
        var n = App.utils.normalizeColor(val.trim());
        return n === source ? prefix + target : match;
      });
      newStyle = newStyle.replace(/(stroke\s*:\s*)([^;]+)/gi, function(match, prefix, val) {
        var n = App.utils.normalizeColor(val.trim());
        return n === source ? prefix + target : match;
      });
      node.setAttribute('style', newStyle);
    }

    if (node.tagName === 'style' || node.tagName === 'STYLE') {
      var css = node.textContent;
      css = css.replace(/(fill\s*:\s*)([^;}\s]+)/gi, function(match, prefix, val) {
        var n = App.utils.normalizeColor(val.trim());
        return n === source ? prefix + target : match;
      });
      css = css.replace(/(stroke\s*:\s*)([^;}\s]+)/gi, function(match, prefix, val) {
        var n = App.utils.normalizeColor(val.trim());
        return n === source ? prefix + target : match;
      });
      node.textContent = css;
    }

    if (node.tagName === 'stop') {
      var stopColor = node.getAttribute('stop-color');
      if (stopColor) {
        var n = App.utils.normalizeColor(stopColor);
        if (n === source) node.setAttribute('stop-color', target);
      }
    }

    for (var ci = 0; ci < node.children.length; ci++) {
      App.colorReplacement.replaceSVGColors(node.children[ci], source, target);
    }
  },

  removeSVGBackgrounds: function(node) {
    if (node.nodeType !== 1) return;
    var state = App.state;
    var threshold = state.bgThreshold;
    var bgRgb = App.utils.hexToRgb(state.bgRemovalColor);

    var val = node.getAttribute('fill');
    if (val) {
      var hex = App.utils.normalizeColor(val);
      if (hex) {
        var rgb = App.utils.hexToRgb(hex);
        var dist = App.utils.colorDistance(rgb, bgRgb);
        if (dist < threshold) {
          node.setAttribute('fill', 'none');
          node.setAttribute('fill-opacity', '0');
        }
      }
    }

    var style = node.getAttribute('style');
    if (style) {
      var newStyle = style.replace(/(fill\s*:\s*)([^;]+)/gi, function(match, prefix, val) {
        var hex2 = App.utils.normalizeColor(val.trim());
        if (hex2) {
          var rgb2 = App.utils.hexToRgb(hex2);
          var dist2 = App.utils.colorDistance(rgb2, bgRgb);
          if (dist2 < threshold) return prefix + 'none';
        }
        return match;
      });
      node.setAttribute('style', newStyle);
    }

    for (var ci = 0; ci < node.children.length; ci++) {
      App.colorReplacement.removeSVGBackgrounds(node.children[ci]);
    }
  },

  renderProcessedSVG: function() {
    App.colorReplacement.applySVGProcessing();
  },
};
