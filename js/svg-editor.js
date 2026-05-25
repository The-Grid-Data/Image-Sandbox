// js/svg-editor.js — Inline SVG rendering for element-level editing (select, move, resize, extract)
'use strict';

App.svgEditor = {
  _inlineSVG: null,
  _savedCompareModeDisplay: null,
  _savedSelectiveDisplay: null,
  _originalTransforms: null,  // Map<el, transform|null> snapshot taken at init

  // Replace the blob-<img> in originalLayer with an inline <svg> clone so child
  // elements are real DOM nodes that can be clicked and transformed.
  init: function() {
    var state = App.state;
    var dom = App.dom;
    if (state.fileType !== 'svg' || !state.svgDoc) return;

    var clone = state.svgDoc.documentElement.cloneNode(true);
    // Let the container control sizing via CSS
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.classList.add('svg-preview');
    clone.style.cursor = 'default';

    dom.originalLayer.innerHTML = '';
    dom.originalLayer.appendChild(clone);
    App.svgEditor._inlineSVG = clone;

    clone.addEventListener('click', App.svgEditor._onClick);
    state.selectedSVGEl = null;

    // Snapshot every element's transform so resetEdits() can restore to this state
    var snap = new Map();
    Array.prototype.forEach.call(clone.querySelectorAll('*'), function(el) {
      snap.set(el, el.getAttribute('transform'));
    });
    App.svgEditor._originalTransforms = snap;

    // Show the full originalLayer so all SVG elements are clickable; hide processed layer
    dom.originalLayer.style.clipPath = '';
    dom.processedLayer.style.clipPath = 'inset(0 100% 0 0)';
    dom.comparisonHandle.style.display = 'none';
    dom.comparison.style.cursor = 'default';
    // Hide compare controls — they don't apply during element editing
    App.svgEditor._savedCompareModeDisplay = dom.compareModeSelect.style.display;
    App.svgEditor._savedSelectiveDisplay = dom.btnSelective ? dom.btnSelective.style.display : null;
    dom.compareModeSelect.style.display = 'none';
    if (dom.btnSelective) dom.btnSelective.style.display = 'none';
  },

  _onClick: function(e) {
    e.stopPropagation();
    var svgRoot = App.svgEditor._inlineSVG;
    // Walk up to find the direct child of the SVG root (skip structural elements)
    var el = e.target;
    while (el && el.parentNode !== svgRoot) {
      el = el.parentNode;
    }
    var skip = { defs: 1, title: 1, desc: 1, style: 1, script: 1 };
    if (!el || el === svgRoot || el.id === 'svg-sel-box' || skip[el.tagName]) {
      App.svgEditor.deselectAll();
      return;
    }
    if (el === App.state.selectedSVGEl) {
      App.svgEditor.deselectAll();
    } else {
      App.svgEditor.selectElement(el);
    }
  },

  selectElement: function(el) {
    App.svgEditor._clearHighlight();
    App.state.selectedSVGEl = el;
    App.svgEditor._drawHighlight(el);
    if (App.app && App.app.updateSvgEditActions) App.app.updateSvgEditActions();
  },

  deselectAll: function() {
    App.svgEditor._clearHighlight();
    App.state.selectedSVGEl = null;
    if (App.app && App.app.updateSvgEditActions) App.app.updateSvgEditActions();
  },

  _drawHighlight: function(el) {
    var svgRoot = App.svgEditor._inlineSVG;
    if (!svgRoot) return;
    try {
      var bb = el.getBBox();
      var NS = 'http://www.w3.org/2000/svg';
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('id', 'svg-sel-box');
      rect.setAttribute('x', bb.x - 3);
      rect.setAttribute('y', bb.y - 3);
      rect.setAttribute('width', Math.max(bb.width + 6, 1));
      rect.setAttribute('height', Math.max(bb.height + 6, 1));
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', '#a855f7');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '5 3');
      rect.setAttribute('pointer-events', 'none');
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      svgRoot.appendChild(rect);
    } catch (_e) { /* getBBox may throw on non-rendered elements */ }
  },

  _clearHighlight: function() {
    var svgRoot = App.svgEditor._inlineSVG;
    if (!svgRoot) return;
    var box = svgRoot.querySelector('#svg-sel-box');
    if (box) box.parentNode.removeChild(box);
  },

  // Move the selected element by (dx, dy) in screen pixels, converted to SVG user units.
  moveSelected: function(dx, dy) {
    var state = App.state;
    var el = state.selectedSVGEl;
    if (!el) return;
    var svgRoot = App.svgEditor._inlineSVG;
    if (!svgRoot) return;

    // Convert screen-pixel delta to SVG user-unit delta
    var ctm = svgRoot.getScreenCTM();
    var pt0 = svgRoot.createSVGPoint();
    var pt1 = svgRoot.createSVGPoint();
    pt1.x = dx;
    pt1.y = dy;
    var inv = ctm.inverse();
    var origin = pt0.matrixTransform(inv);
    var moved = pt1.matrixTransform(inv);
    var svgDx = moved.x - origin.x;
    var svgDy = moved.y - origin.y;

    var prevTransform = el.getAttribute('transform') || '';
    state.svgEditHistory.push({ el: el, prevTransform: prevTransform });
    state.svgEditRedoStack = [];

    var next = 'translate(' + svgDx + ',' + svgDy + ')' + (prevTransform ? ' ' + prevTransform : '');
    el.setAttribute('transform', next);
    App.svgEditor._clearHighlight();
    App.svgEditor._drawHighlight(el);
  },

  // Scale the selected element about its bounding-box centre by `scale`.
  resizeSelected: function(scale) {
    var state = App.state;
    var el = state.selectedSVGEl;
    if (!el) return;
    try {
      var bb = el.getBBox();
      var cx = bb.x + bb.width / 2;
      var cy = bb.y + bb.height / 2;

      var prevTransform = el.getAttribute('transform') || '';
      state.svgEditHistory.push({ el: el, prevTransform: prevTransform });
      state.svgEditRedoStack = [];

      var scaleXf = 'translate(' + cx + ',' + cy + ') scale(' + scale + ') translate(' + (-cx) + ',' + (-cy) + ')';
      var next = scaleXf + (prevTransform ? ' ' + prevTransform : '');
      el.setAttribute('transform', next);
      App.svgEditor._clearHighlight();
      App.svgEditor._drawHighlight(el);
    } catch (_e) {}
  },

  // Extract the selected element as a standalone SVG file, preserving referenced defs.
  extractSelected: function() {
    var state = App.state;
    var el = state.selectedSVGEl;
    if (!el) {
      App.utils.showToast('Select an element first.', 'error');
      return;
    }

    var bb;
    try { bb = el.getBBox(); } catch (_e) { bb = null; }
    if (!bb || (bb.width === 0 && bb.height === 0)) {
      App.utils.showToast("Selected element has no renderable area — can't extract.", 'error');
      return;
    }

    // Gather IDs referenced by this element subtree (fill/stroke url(), clipPath, filter, mask, href)
    var usedIds = {};
    var refRe = /url\(#([^)]+)\)|#([a-zA-Z][\w-]*)/g;
    (function collectRefs(node) {
      if (node.nodeType !== 1) return;
      var attrs = node.attributes;
      for (var i = 0; i < attrs.length; i++) {
        var val = attrs[i].value;
        var m;
        refRe.lastIndex = 0;
        while ((m = refRe.exec(val)) !== null) {
          usedIds[m[1] || m[2]] = true;
        }
      }
      for (var c = node.firstChild; c; c = c.nextSibling) collectRefs(c);
    }(el));

    // Copy matching defs from the source SVG document
    var NS = 'http://www.w3.org/2000/svg';
    var prefix = 'x-';
    var sourceDefs = state.svgDoc ? state.svgDoc.querySelectorAll('defs > *') : [];
    var defsNodes = [];
    Array.prototype.forEach.call(sourceDefs, function(def) {
      var id = def.id || def.getAttribute('id');
      if (id && usedIds[id]) defsNodes.push(def.cloneNode(true));
    });

    // Build the output SVG
    var pad = 4;
    var newSVG = document.createElementNS(NS, 'svg');
    newSVG.setAttribute('xmlns', NS);
    newSVG.setAttribute('viewBox', (bb.x - pad) + ' ' + (bb.y - pad) + ' ' + (bb.width + pad * 2) + ' ' + (bb.height + pad * 2));
    newSVG.setAttribute('width', Math.round(bb.width + pad * 2));
    newSVG.setAttribute('height', Math.round(bb.height + pad * 2));

    // Prefix IDs in defs and update url() references in the element clone
    // to avoid collisions if the SVG is embedded elsewhere.
    function prefixId(str) {
      return str.replace(/\bid="([^"]+)"/g, function(_, id) { return 'id="' + prefix + id + '"'; });
    }
    function prefixRefs(str) {
      return str.replace(/url\(#([^)]+)\)/g, function(_, id) { return 'url(#' + prefix + id + ')'; })
               .replace(/href="#([^"]+)"/g, function(_, id) { return 'href="#' + prefix + id + '"'; })
               .replace(/xlink:href="#([^"]+)"/g, function(_, id) { return 'xlink:href="#' + prefix + id + '"'; });
    }

    if (defsNodes.length) {
      var defs = document.createElementNS(NS, 'defs');
      defsNodes.forEach(function(d) {
        var s = new XMLSerializer().serializeToString(d);
        var tmp = document.createElement('div');
        tmp.innerHTML = prefixId(prefixRefs(s));
        defs.appendChild(tmp.firstChild || d);
      });
      newSVG.appendChild(defs);
    }

    var elClone = el.cloneNode(true);
    // Apply the id-prefixing to the cloned element's references
    var elStr = new XMLSerializer().serializeToString(elClone);
    var tmp2 = document.createElement('div');
    tmp2.innerHTML = prefixRefs(elStr);
    var prefixedEl = tmp2.firstChild || elClone;
    newSVG.appendChild(prefixedEl);

    var svgStr = new XMLSerializer().serializeToString(newSVG);
    // XMLSerializer adds xmlns on every element it touches; deduplicate so downstream
    // tools (Figma, browsers) don't hit "Attribute xmlns redefined" parse errors.
    var seenNs = {};
    svgStr = svgStr.replace(/ xmlns(?::[a-z]+)?="[^"]*"/g, function(match) {
      if (seenNs[match]) return '';
      seenNs[match] = true;
      return match;
    });
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    var baseName = (state.fileName || 'image').replace(/\.svg$/i, '');
    App.download.downloadBlob(blob, baseName + '_element.svg');
  },

  // Undo the last SVG element transform. Called by the undo dispatcher in app.js.
  undoEdit: function() {
    var state = App.state;
    if (!state.svgEditHistory.length) return false;
    var entry = state.svgEditHistory.pop();
    var curTransform = entry.el.getAttribute('transform') || '';
    state.svgEditRedoStack.push({ el: entry.el, prevTransform: curTransform });
    if (entry.prevTransform) {
      entry.el.setAttribute('transform', entry.prevTransform);
    } else {
      entry.el.removeAttribute('transform');
    }
    App.svgEditor._clearHighlight();
    if (state.selectedSVGEl === entry.el) {
      App.svgEditor._drawHighlight(entry.el);
    }
    return true;
  },

  // Redo the last undone SVG element transform.
  redoEdit: function() {
    var state = App.state;
    if (!state.svgEditRedoStack.length) return false;
    var entry = state.svgEditRedoStack.pop();
    var curTransform = entry.el.getAttribute('transform') || '';
    state.svgEditHistory.push({ el: entry.el, prevTransform: curTransform });
    if (entry.prevTransform) {
      entry.el.setAttribute('transform', entry.prevTransform);
    } else {
      entry.el.removeAttribute('transform');
    }
    App.svgEditor._clearHighlight();
    if (state.selectedSVGEl === entry.el) {
      App.svgEditor._drawHighlight(entry.el);
    }
    return true;
  },

  resetEdits: function() {
    var state = App.state;
    var snap = App.svgEditor._originalTransforms;
    if (!App.svgEditor._inlineSVG || !snap) return;
    snap.forEach(function(transform, el) {
      if (transform === null) {
        el.removeAttribute('transform');
      } else {
        el.setAttribute('transform', transform);
      }
    });
    state.svgEditHistory = [];
    state.svgEditRedoStack = [];
    App.svgEditor.deselectAll();
  },

  // Restore blob-<img> rendering and clear all edit state.
  deactivate: function() {
    var state = App.state;
    var dom = App.dom;
    App.svgEditor._clearHighlight();
    App.svgEditor._inlineSVG = null;
    state.selectedSVGEl = null;
    state.svgEditHistory = [];
    state.svgEditRedoStack = [];

    // Restore comparison slider state (skip if canvas export mode owns the layers)
    if (!App.state.canvasMode) {
      var pct = state.sliderPos;
      dom.originalLayer.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      dom.processedLayer.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      dom.comparisonHandle.style.display = '';
      dom.comparison.style.cursor = 'col-resize';
    }
    // Restore compare controls
    if (App.svgEditor._savedCompareModeDisplay !== null) {
      dom.compareModeSelect.style.display = App.svgEditor._savedCompareModeDisplay;
    }
    if (dom.btnSelective && App.svgEditor._savedSelectiveDisplay !== null) {
      dom.btnSelective.style.display = App.svgEditor._savedSelectiveDisplay;
    }
    App.svgEditor._savedCompareModeDisplay = null;
    App.svgEditor._savedSelectiveDisplay = null;

    if (state.fileType === 'svg') {
      App.colorReplacement.renderOriginalSVG();
    }
  },
};
