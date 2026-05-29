// js/svg-editor.js — Inline SVG element editing (multi-select, move, resize, extract)
'use strict';

App.svgEditor = {
  _inlineSVG: null,
  _savedCompareModeDisplay: null,
  _savedSelectiveDisplay: null,
  _originalTransforms: null,  // Map<el, transform|null> snapshot taken at init
  _nextGroupId: 1,

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
    state.selectedSVGEls = [];

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
    var isHighlight = el && el.classList && el.classList.contains('svg-sel-box');
    var additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (!el || el === svgRoot || isHighlight || skip[el.tagName]) {
      // Click on empty/structural: deselect, unless the user is holding a modifier
      // (additive click on empty space is a no-op — preserves current selection).
      if (!additive) App.svgEditor.deselectAll();
      return;
    }

    if (additive) {
      App.svgEditor.toggleElement(el);
    } else {
      // Plain click: if it's already the sole selected, deselect; else replace.
      var sel = App.state.selectedSVGEls;
      if (sel.length === 1 && sel[0] === el) {
        App.svgEditor.deselectAll();
      } else {
        App.svgEditor._setSelection([el]);
      }
    }
  },

  _setSelection: function(els) {
    App.state.selectedSVGEls = els.slice();
    App.svgEditor._redrawAllHighlights();
    if (App.app && App.app.updateSvgEditActions) App.app.updateSvgEditActions();
  },

  toggleElement: function(el) {
    var sel = App.state.selectedSVGEls.slice();
    var idx = sel.indexOf(el);
    if (idx >= 0) sel.splice(idx, 1);
    else sel.push(el);
    App.svgEditor._setSelection(sel);
  },

  selectElement: function(el) {
    App.svgEditor._setSelection([el]);
  },

  deselectAll: function() {
    App.svgEditor._setSelection([]);
  },

  _redrawAllHighlights: function() {
    App.svgEditor._clearHighlights();
    App.state.selectedSVGEls.forEach(function(el) {
      App.svgEditor._drawHighlight(el);
    });
  },

  _drawHighlight: function(el) {
    var svgRoot = App.svgEditor._inlineSVG;
    if (!svgRoot) return;
    try {
      var bb = el.getBBox();
      var NS = 'http://www.w3.org/2000/svg';
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'svg-sel-box');
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

  _clearHighlights: function() {
    var svgRoot = App.svgEditor._inlineSVG;
    if (!svgRoot) return;
    var boxes = svgRoot.querySelectorAll('.svg-sel-box');
    Array.prototype.forEach.call(boxes, function(b) { b.parentNode.removeChild(b); });
  },

  _newGroupId: function() {
    return 'g' + (App.svgEditor._nextGroupId++);
  },

  // Move every selected element by (dx, dy) screen pixels. All entries share a
  // groupId so a single ⌘Z reverts the whole batch.
  moveSelected: function(dx, dy) {
    var state = App.state;
    var els = state.selectedSVGEls;
    if (!els.length) return;
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

    var groupId = App.svgEditor._newGroupId();
    state.svgEditRedoStack = [];
    els.forEach(function(el) {
      var prevTransform = el.getAttribute('transform') || '';
      state.svgEditHistory.push({ el: el, prevTransform: prevTransform, groupId: groupId });
      var next = 'translate(' + svgDx + ',' + svgDy + ')' + (prevTransform ? ' ' + prevTransform : '');
      el.setAttribute('transform', next);
    });
    App.svgEditor._redrawAllHighlights();
  },

  // Scale each selected element about its own bounding-box centre by `scale`.
  resizeSelected: function(scale) {
    var state = App.state;
    var els = state.selectedSVGEls;
    if (!els.length) return;

    var groupId = App.svgEditor._newGroupId();
    state.svgEditRedoStack = [];
    els.forEach(function(el) {
      try {
        var bb = el.getBBox();
        var cx = bb.x + bb.width / 2;
        var cy = bb.y + bb.height / 2;
        var prevTransform = el.getAttribute('transform') || '';
        state.svgEditHistory.push({ el: el, prevTransform: prevTransform, groupId: groupId });
        var scaleXf = 'translate(' + cx + ',' + cy + ') scale(' + scale + ') translate(' + (-cx) + ',' + (-cy) + ')';
        var next = scaleXf + (prevTransform ? ' ' + prevTransform : '');
        el.setAttribute('transform', next);
      } catch (_e) {}
    });
    App.svgEditor._redrawAllHighlights();
  },

  // Extract selected element(s) as one standalone SVG, preserving referenced defs.
  // Multi-selection emits a single file with a union bbox, elements re-ordered
  // by document position so the original stacking is preserved.
  extractSelected: function() {
    var state = App.state;
    var els = state.selectedSVGEls;
    if (!els.length) {
      App.utils.showToast('Select an element first.', 'error');
      return;
    }

    var union = null;
    var renderable = [];
    els.forEach(function(el) {
      var bb;
      try { bb = el.getBBox(); } catch (_e) { bb = null; }
      if (!bb || (bb.width === 0 && bb.height === 0)) return;
      renderable.push(el);
      if (!union) {
        union = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      } else {
        var x2 = Math.max(union.x + union.w, bb.x + bb.width);
        var y2 = Math.max(union.y + union.h, bb.y + bb.height);
        union.x = Math.min(union.x, bb.x);
        union.y = Math.min(union.y, bb.y);
        union.w = x2 - union.x;
        union.h = y2 - union.y;
      }
    });
    if (!renderable.length || !union) {
      App.utils.showToast("Selection has no renderable area — can't extract.", 'error');
      return;
    }

    // Sort by document order so output preserves original stacking
    renderable.sort(function(a, b) {
      var rel = a.compareDocumentPosition(b);
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Gather IDs referenced across the whole selection
    var usedIds = {};
    var refRe = /url\(#([^)]+)\)|#([a-zA-Z][\w-]*)/g;
    function collectRefs(node) {
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
    }
    renderable.forEach(collectRefs);

    var NS = 'http://www.w3.org/2000/svg';
    var prefix = 'x-';
    var sourceDefs = state.svgDoc ? state.svgDoc.querySelectorAll('defs > *') : [];
    var defsNodes = [];
    Array.prototype.forEach.call(sourceDefs, function(def) {
      var id = def.id || def.getAttribute('id');
      if (id && usedIds[id]) defsNodes.push(def.cloneNode(true));
    });

    var pad = 4;
    var newSVG = document.createElementNS(NS, 'svg');
    newSVG.setAttribute('xmlns', NS);
    newSVG.setAttribute('viewBox', (union.x - pad) + ' ' + (union.y - pad) + ' ' + (union.w + pad * 2) + ' ' + (union.h + pad * 2));
    newSVG.setAttribute('width', Math.round(union.w + pad * 2));
    newSVG.setAttribute('height', Math.round(union.h + pad * 2));

    // Prefix IDs in defs and update url() references in element clones
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

    renderable.forEach(function(el) {
      var elClone = el.cloneNode(true);
      var elStr = new XMLSerializer().serializeToString(elClone);
      var tmp2 = document.createElement('div');
      tmp2.innerHTML = prefixRefs(elStr);
      newSVG.appendChild(tmp2.firstChild || elClone);
    });

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
    var suffix = renderable.length > 1 ? '_elements' : '_element';
    App.download.downloadBlob(blob, baseName + suffix + '.svg');
  },

  // Undo the last group of SVG element transforms. Entries sharing a groupId
  // revert together so a single ⌘Z undoes a multi-element move/resize.
  undoEdit: function() {
    var state = App.state;
    if (!state.svgEditHistory.length) return false;
    var top = state.svgEditHistory[state.svgEditHistory.length - 1];
    var groupId = top.groupId;
    while (state.svgEditHistory.length) {
      var t = state.svgEditHistory[state.svgEditHistory.length - 1];
      if (t.groupId !== groupId) break;
      state.svgEditHistory.pop();
      var curTransform = t.el.getAttribute('transform') || '';
      state.svgEditRedoStack.push({ el: t.el, prevTransform: curTransform, groupId: groupId });
      if (t.prevTransform) {
        t.el.setAttribute('transform', t.prevTransform);
      } else {
        t.el.removeAttribute('transform');
      }
      if (!groupId) break; // legacy ungrouped entry: revert one
    }
    App.svgEditor._redrawAllHighlights();
    return true;
  },

  // Redo the last undone group.
  redoEdit: function() {
    var state = App.state;
    if (!state.svgEditRedoStack.length) return false;
    var top = state.svgEditRedoStack[state.svgEditRedoStack.length - 1];
    var groupId = top.groupId;
    while (state.svgEditRedoStack.length) {
      var t = state.svgEditRedoStack[state.svgEditRedoStack.length - 1];
      if (t.groupId !== groupId) break;
      state.svgEditRedoStack.pop();
      var curTransform = t.el.getAttribute('transform') || '';
      state.svgEditHistory.push({ el: t.el, prevTransform: curTransform, groupId: groupId });
      if (t.prevTransform) {
        t.el.setAttribute('transform', t.prevTransform);
      } else {
        t.el.removeAttribute('transform');
      }
      if (!groupId) break;
    }
    App.svgEditor._redrawAllHighlights();
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
    App.svgEditor._clearHighlights();
    App.svgEditor._inlineSVG = null;
    state.selectedSVGEls = [];
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
