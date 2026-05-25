// js/canvas-export.js — Canvas mode: crop overlay + fit-to-spec export
'use strict';

var _overlayDiv = null;
var _overlayCanvas = null;
var _overlayCtx = null;
var _savedBrushMode = null;
var _savedSelectiveMode = false;
var _previewImg = null; // cached SVG img for icon preview

App.canvasExport = {

  // ── Source dimensions (always in original-source-pixel space; upscale is export-time only) ──
  _getSourceDimensions: function() {
    return { w: App.state.imgWidth, h: App.state.imgHeight };
  },

  // ── Activate canvas mode ──
  activate: function(type) {
    var state = App.state;
    var dom = App.dom;

    // Snapshot modes to restore on deactivate
    _savedBrushMode = state.brushMode;
    _savedSelectiveMode = state.selectiveMode;

    // Deactivate conflicting modes
    App.bgRemoval.setBrushMode(null);

    if (state.selectiveMode) {
      state.selectiveMode = false;
      dom.btnSelective.classList.remove('active');
      dom.compareModeSelect.style.display = '';
      var labels = App.comparison.COMPARE_LABELS[state.compareMode] || ['Before', 'After'];
      dom.labelBefore.textContent = labels[0];
      dom.labelAfter.textContent = labels[1];
    }

    if (App.svgEditor) App.svgEditor.deactivate();

    // Hide comparison chrome that sits outside comparisonContent's stacking context
    dom.comparisonHandle.style.display = 'none';
    if (dom.dimensionBadge) dom.dimensionBadge.style.display = 'none';
    // Clear comparison split so both layers show fully through the frame cut-out
    dom.originalLayer.style.clipPath = '';
    dom.processedLayer.style.clipPath = '';

    // Set mode
    state.canvasMode = type;

    // For icon mode: sync padding slider display and seed the preview image
    if (type === 'icon') {
      var pct = Math.round((state.iconPadding || 0.1) * 100);
      if (dom.iconPaddingSlider) dom.iconPaddingSlider.value = pct;
      if (dom.iconPaddingValue) dom.iconPaddingValue.textContent = pct;
    }

    // Initialise cropRect in source-pixel space
    var src = App.canvasExport._getSourceDimensions();
    if (type === 'icon') {
      // Largest centered square — user drags/resizes to select the region to export
      var sqSize = Math.min(src.w, src.h);
      state.cropRect = {
        x: Math.round((src.w - sqSize) / 2),
        y: Math.round((src.h - sqSize) / 2),
        w: sqSize,
        h: sqSize
      };
    } else if (type === 'logo') {
      state.cropRect = { x: 0, y: 0, w: src.w, h: src.h };
    } else if (type === 'header') {
      // 3:1 centred crop, clamped to source
      var cW = Math.min(src.w, src.h * 3);
      var cH = Math.min(src.h, src.w / 3);
      if (cW / cH > 3) cW = cH * 3;
      if (cH !== 0 && cW / cH < 3) cH = cW / 3;
      state.cropRect = {
        x: Math.round((src.w - cW) / 2),
        y: Math.round((src.h - cH) / 2),
        w: Math.round(cW),
        h: Math.round(cH)
      };
    }

    // Create overlay inside comparisonContent (so zoom/pan transform applies automatically)
    _overlayDiv = document.createElement('div');
    _overlayDiv.className = 'canvas-overlay';
    _overlayCanvas = document.createElement('canvas');
    _overlayDiv.appendChild(_overlayCanvas);
    dom.comparisonContent.appendChild(_overlayDiv);
    _overlayCtx = _overlayCanvas.getContext('2d');

    App.canvasExport._registerOverlayEvents();
    App.canvasExport.renderOverlay();
  },

  // ── Deactivate canvas mode ──
  deactivate: function() {
    var state = App.state;
    var dom = App.dom;

    if (_overlayDiv && _overlayDiv.parentNode) {
      _overlayDiv.parentNode.removeChild(_overlayDiv);
    }
    _overlayDiv = null;
    _overlayCanvas = null;
    _overlayCtx = null;
    App.canvasExport._removeOverlayEvents();

    state.canvasMode = null;
    state.cropRect = null;
    _previewImg = null;

    // Restore hidden comparison chrome and layer clips
    dom.comparisonHandle.style.display = '';
    if (dom.dimensionBadge) dom.dimensionBadge.style.display = '';
    var pct = state.sliderPos;
    dom.originalLayer.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    dom.processedLayer.style.clipPath = 'inset(0 0 0 ' + pct + '%)';

    // Restore snapshotted modes
    if (_savedSelectiveMode) {
      state.selectiveMode = true;
      dom.btnSelective.classList.add('active');
      dom.compareModeSelect.style.display = 'none';
      dom.labelBefore.textContent = 'Protected';
      dom.labelAfter.textContent = 'Processing';
    }
    // brushMode is restored via setBrushMode (which also updates cursor/toolbar)
    if (_savedBrushMode) {
      App.bgRemoval.setBrushMode(_savedBrushMode);
    }
    _savedBrushMode = null;
    _savedSelectiveMode = false;

    // Strip active class from media-type buttons
    var dom2 = App.dom;
    if (dom2.btnCanvasIcon)   dom2.btnCanvasIcon.classList.remove('active');
    if (dom2.btnCanvasLogo)   dom2.btnCanvasLogo.classList.remove('active');
    if (dom2.btnCanvasHeader) dom2.btnCanvasHeader.classList.remove('active');

    if (App.app && App.app.updateCanvasPanel) App.app.updateCanvasPanel();
  },

  // ── Image transform: maps source-pixel coords → overlay-canvas coords ──
  // Images render with object-fit:contain, max-height:500px, centered in the container.
  // The container may be taller than the image (min-height:200px CSS floor), so we cannot
  // use containerW/src.w and containerH/src.h independently — they diverge for short images.
  _getImageTransform: function() {
    var src = App.canvasExport._getSourceDimensions();
    var dom = App.dom;
    var containerW = dom.comparisonContent.offsetWidth || 1;
    var containerH = dom.comparisonContent.offsetHeight || 1;
    var MAX_H = 500;
    var scale = Math.min(containerW / src.w, MAX_H / src.h);
    var renderedW = src.w * scale;
    var renderedH = src.h * scale;
    return {
      scale: scale,
      offsetX: (containerW - renderedW) / 2,
      offsetY: (containerH - renderedH) / 2
    };
  },

  // ── Render the crop frame overlay ──
  renderOverlay: function() {
    if (!_overlayCanvas || !_overlayCtx) return;
    var state = App.state;
    var dom = App.dom;

    // Size the canvas to the current comparisonContent render area
    var containerW = dom.comparisonContent.offsetWidth;
    var containerH = dom.comparisonContent.offsetHeight;
    if (!containerW || !containerH) return;

    _overlayCanvas.width = containerW;
    _overlayCanvas.height = containerH;

    var ctx = _overlayCtx;
    ctx.clearRect(0, 0, containerW, containerH);

    var t = App.canvasExport._getImageTransform();

    if (state.canvasMode === 'icon') {
      var cr = state.cropRect;
      if (!cr) return;
      var fX = t.offsetX + cr.x * t.scale;
      var fY = t.offsetY + cr.y * t.scale;
      var fW = cr.w * t.scale;
      var fH = cr.h * t.scale;

      // Dark overlay outside frame — actual image shows through the cut-out
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, containerW, fY);
      ctx.fillRect(0, fY + fH, containerW, containerH - fY - fH);
      ctx.fillRect(0, fY, fX, fH);
      ctx.fillRect(fX + fW, fY, containerW - fX - fW, fH);

      // Frame border
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeRect(fX, fY, fW, fH);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fX, fY, fW, fH);

      // Dashed inner guide showing the content zone after padding is applied
      var pad = state.iconPadding || 0;
      if (pad > 0) {
        var padPx = fW * pad;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(fX + padPx, fY + padPx, fW - 2 * padPx, fH - 2 * padPx);
        ctx.restore();
      }

      // Corner resize handles
      var hs = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(fX - hs / 2,            fY - hs / 2,            hs, hs); // TL
      ctx.fillRect(fX + fW - hs / 2,       fY - hs / 2,            hs, hs); // TR
      ctx.fillRect(fX - hs / 2,            fY + fH - hs / 2,       hs, hs); // BL
      ctx.fillRect(fX + fW - hs / 2,       fY + fH - hs / 2,       hs, hs); // BR

      // Label
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText('512 × 512 (icon)', fX + fW / 2, Math.max(12, fY - 6));
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText('512 × 512 (icon)', fX + fW / 2, Math.max(12, fY - 6));

    } else if (state.canvasMode === 'logo' || state.canvasMode === 'header') {
      var cr = state.cropRect;
      if (!cr) return;

      var fX = t.offsetX + cr.x * t.scale;
      var fY = t.offsetY + cr.y * t.scale;
      var fW = cr.w * t.scale;
      var fH = cr.h * t.scale;

      // Dark overlay with cut-out (4-rect approach)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // Top strip
      ctx.fillRect(0, 0, containerW, fY);
      // Bottom strip
      ctx.fillRect(0, fY + fH, containerW, containerH - fY - fH);
      // Left strip
      ctx.fillRect(0, fY, fX, fH);
      // Right strip
      ctx.fillRect(fX + fW, fY, containerW - fX - fW, fH);

      // Frame border — dark outline then white fill so it's visible on any bg
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeRect(fX, fY, fW, fH);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fX, fY, fW, fH);

      // Edge handles (visible drag targets)
      var hs = 6; // handle size
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      // Left, right, top, bottom mid-edge handles
      ctx.fillRect(fX - hs / 2, fY + fH / 2 - hs / 2, hs, hs);
      ctx.fillRect(fX + fW - hs / 2, fY + fH / 2 - hs / 2, hs, hs);
      if (state.canvasMode === 'logo') {
        ctx.fillRect(fX + fW / 2 - hs / 2, fY - hs / 2, hs, hs);
        ctx.fillRect(fX + fW / 2 - hs / 2, fY + fH - hs / 2, hs, hs);
      }

      // Label
      var label = state.canvasMode === 'logo'
        ? 'Logo (×512px tall)'
        : '1500 × 500 (header)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(label, fX + fW / 2, Math.max(12, fY - 6));
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(label, fX + fW / 2, Math.max(12, fY - 6));
    }
  },

  // ── Drag interaction (Tasks 5 only — stubs here to avoid ReferenceError) ──
  _dragState: null,

  _registerOverlayEvents: function() {
    if (!_overlayDiv) return;
    _overlayDiv.addEventListener('mousedown', App.canvasExport._onDragStart);
    _overlayDiv.addEventListener('mousemove', App.canvasExport._onHover);
    _overlayDiv.addEventListener('mouseleave', App.canvasExport._onHoverLeave);
    _overlayDiv.addEventListener('touchstart', App.canvasExport._onTouchStart, { passive: false });
    window.addEventListener('mousemove', App.canvasExport._onDragMove);
    window.addEventListener('mouseup', App.canvasExport._onDragEnd);
    window.addEventListener('touchmove', App.canvasExport._onTouchMove, { passive: false });
    window.addEventListener('touchend', App.canvasExport._onDragEnd);
  },

  _removeOverlayEvents: function() {
    window.removeEventListener('mousemove', App.canvasExport._onDragMove);
    window.removeEventListener('mouseup', App.canvasExport._onDragEnd);
    window.removeEventListener('touchmove', App.canvasExport._onTouchMove);
    window.removeEventListener('touchend', App.canvasExport._onDragEnd);
  },

  // ── Coordinate helpers ──
  _screenToSource: function(screenX, screenY) {
    if (!_overlayCanvas) return { x: 0, y: 0 };
    var rect = _overlayCanvas.getBoundingClientRect();
    var t = App.canvasExport._getImageTransform();
    // rect.width may differ from offsetWidth when the CSS zoom transform is applied;
    // use the ratio to account for any CSS scaling of the overlay canvas itself.
    var cssScale = rect.width / (_overlayCanvas.width || rect.width);
    return {
      x: (screenX - rect.left - t.offsetX * cssScale) / (t.scale * cssScale),
      y: (screenY - rect.top  - t.offsetY * cssScale) / (t.scale * cssScale)
    };
  },

  // Returns 'interior' | 'left' | 'right' | 'top' | 'bottom' | 'corner-tl/tr/bl/br' | null
  _hitZone: function(screenX, screenY) {
    var state = App.state;
    if (!state.cropRect) return null;
    if (!_overlayCanvas) return null;
    var cr = state.cropRect;
    var rect = _overlayCanvas.getBoundingClientRect();
    var t = App.canvasExport._getImageTransform();
    var cssScale = rect.width / (_overlayCanvas.width || rect.width);
    var fX = rect.left + (t.offsetX + cr.x * t.scale) * cssScale;
    var fY = rect.top  + (t.offsetY + cr.y * t.scale) * cssScale;
    var fW = cr.w * t.scale * cssScale;
    var fH = cr.h * t.scale * cssScale;
    var EDGE = 10; // px hit threshold

    if (screenX < fX - EDGE || screenX > fX + fW + EDGE ||
        screenY < fY - EDGE || screenY > fY + fH + EDGE) {
      return null;
    }
    if (state.canvasMode === 'icon') {
      var cHit = 14;
      if (Math.abs(screenX - fX)        <= cHit && Math.abs(screenY - fY)        <= cHit) return 'corner-tl';
      if (Math.abs(screenX - (fX + fW)) <= cHit && Math.abs(screenY - fY)        <= cHit) return 'corner-tr';
      if (Math.abs(screenX - fX)        <= cHit && Math.abs(screenY - (fY + fH)) <= cHit) return 'corner-bl';
      if (Math.abs(screenX - (fX + fW)) <= cHit && Math.abs(screenY - (fY + fH)) <= cHit) return 'corner-br';
      return 'interior';
    }
    if (Math.abs(screenX - fX) <= EDGE)           return 'left';
    if (Math.abs(screenX - (fX + fW)) <= EDGE)    return 'right';
    if (state.canvasMode === 'logo') {
      if (Math.abs(screenY - fY) <= EDGE)         return 'top';
      if (Math.abs(screenY - (fY + fH)) <= EDGE)  return 'bottom';
    }
    return 'interior';
  },

  _snapLogoAR: function(dragAxis) {
    var cr = App.state.cropRect;
    if (!cr || cr.h === 0) return;
    var ar = cr.w / cr.h;
    if (Math.abs(ar - 1.0) >= 0.1) return; // already non-square, no snap needed
    if (dragAxis === 'h') {
      // Vertical drag — adjust height to push away from AR=1
      // Snap to the smaller height (keeping width, so AR > 1)
      cr.h = Math.round(cr.w * (ar < 1 ? 0.9 : 1.1));
    } else {
      // Horizontal drag — adjust width
      cr.w = Math.round(cr.h * (ar < 1 ? 0.9 : 1.1));
    }
  },

  _clampCropRect: function() {
    var cr = App.state.cropRect;
    var src = App.canvasExport._getSourceDimensions();
    if (App.state.canvasMode === 'icon') {
      // Preserve the 1:1 square — clamp size first, then position only
      var maxSize = Math.min(src.w, src.h);
      cr.w = Math.max(1, Math.min(cr.w, maxSize));
      cr.h = cr.w;
      cr.x = Math.max(0, Math.min(cr.x, src.w - cr.w));
      cr.y = Math.max(0, Math.min(cr.y, src.h - cr.h));
    } else {
      cr.w = Math.max(1, Math.min(cr.w, src.w - cr.x));
      cr.h = Math.max(1, Math.min(cr.h, src.h - cr.y));
      cr.x = Math.max(0, Math.min(cr.x, src.w - cr.w));
      cr.y = Math.max(0, Math.min(cr.y, src.h - cr.h));
    }
  },

  _onHover: function(e) {
    if (!_overlayDiv) return;
    var zone = App.canvasExport._hitZone(e.clientX, e.clientY);
    _overlayDiv.classList.remove('drag-move', 'drag-ew', 'drag-ns', 'drag-nwse', 'drag-nesw');
    if (zone === 'interior') _overlayDiv.classList.add('drag-move');
    else if (zone === 'left' || zone === 'right') _overlayDiv.classList.add('drag-ew');
    else if (zone === 'top' || zone === 'bottom') _overlayDiv.classList.add('drag-ns');
    else if (zone === 'corner-tl' || zone === 'corner-br') _overlayDiv.classList.add('drag-nwse');
    else if (zone === 'corner-tr' || zone === 'corner-bl') _overlayDiv.classList.add('drag-nesw');
  },

  _onHoverLeave: function() {
    if (_overlayDiv) _overlayDiv.classList.remove('drag-move', 'drag-ew', 'drag-ns', 'drag-nwse', 'drag-nesw');
  },

  _startDrag: function(clientX, clientY) {
    var zone = App.canvasExport._hitZone(clientX, clientY);
    if (!zone) return;
    var sp = App.canvasExport._screenToSource(clientX, clientY);
    App.canvasExport._dragState = {
      zone: zone,
      startSrcX: sp.x,
      startSrcY: sp.y,
      origRect: Object.assign({}, App.state.cropRect)
    };
  },

  _moveDrag: function(clientX, clientY) {
    var ds = App.canvasExport._dragState;
    if (!ds) return;
    var state = App.state;
    var sp = App.canvasExport._screenToSource(clientX, clientY);
    var dx = sp.x - ds.startSrcX;
    var dy = sp.y - ds.startSrcY;
    var o = ds.origRect;
    var cr = state.cropRect;

    if (ds.zone === 'interior') {
      var src0 = App.canvasExport._getSourceDimensions();
      cr.x = Math.round(o.x + dx);
      cr.y = Math.round(o.y + dy);
      if (state.canvasMode === 'icon') {
        // Position-only clamp — never touch w/h or the square breaks
        cr.x = Math.max(0, Math.min(cr.x, src0.w - cr.w));
        cr.y = Math.max(0, Math.min(cr.y, src0.h - cr.h));
      } else {
        App.canvasExport._clampCropRect();
      }

    } else if (ds.zone.indexOf('corner-') === 0) {
      // Icon mode: resize the 1:1 square; opposite corner is the anchor.
      // Pre-clamp newSize to the space available in both axes so w and h stay equal.
      var corner = ds.zone;
      var src1 = App.canvasExport._getSourceDimensions();
      var anchorX = (corner === 'corner-tl' || corner === 'corner-bl') ? o.x + o.w : o.x;
      var anchorY = (corner === 'corner-tl' || corner === 'corner-tr') ? o.y + o.h : o.y;
      var availX  = (corner === 'corner-tl' || corner === 'corner-bl') ? anchorX            : src1.w - anchorX;
      var availY  = (corner === 'corner-tl' || corner === 'corner-tr') ? anchorY            : src1.h - anchorY;
      var maxSize = Math.max(10, Math.min(availX, availY));
      var newSize = Math.min(
        Math.max(10, Math.max(Math.abs(sp.x - anchorX), Math.abs(sp.y - anchorY))),
        maxSize
      );
      cr.w = Math.round(newSize);
      cr.h = Math.round(newSize);
      cr.x = Math.round((corner === 'corner-tl' || corner === 'corner-bl') ? anchorX - newSize : anchorX);
      cr.y = Math.round((corner === 'corner-tl' || corner === 'corner-tr') ? anchorY - newSize : anchorY);
      // No _clampCropRect — newSize is already bounded, w === h is guaranteed

    } else if (ds.zone === 'left') {
      var newX = Math.round(o.x + dx);
      var newW = o.w - (newX - o.x);
      if (newW >= 1) { cr.x = newX; cr.w = newW; }
      App.canvasExport._clampCropRect();
      if (state.canvasMode === 'logo') App.canvasExport._snapLogoAR('w');

    } else if (ds.zone === 'right') {
      cr.w = Math.max(1, Math.round(o.w + dx));
      App.canvasExport._clampCropRect();
      if (state.canvasMode === 'logo') App.canvasExport._snapLogoAR('w');

    } else if (ds.zone === 'top') {
      var newY = Math.round(o.y + dy);
      var newH = o.h - (newY - o.y);
      if (newH >= 1) { cr.y = newY; cr.h = newH; }
      App.canvasExport._clampCropRect();
      if (state.canvasMode === 'logo') App.canvasExport._snapLogoAR('h');

    } else if (ds.zone === 'bottom') {
      cr.h = Math.max(1, Math.round(o.h + dy));
      App.canvasExport._clampCropRect();
      if (state.canvasMode === 'logo') App.canvasExport._snapLogoAR('h');
    }

    App.canvasExport.renderOverlay();
  },

  _onDragStart: function(e) {
    if (e.button !== 0) return;
    App.canvasExport._startDrag(e.clientX, e.clientY);
    e.preventDefault();
  },

  _onDragMove: function(e) {
    if (!App.canvasExport._dragState) return;
    App.canvasExport._moveDrag(e.clientX, e.clientY);
  },

  _onDragEnd: function() {
    App.canvasExport._dragState = null;
  },

  _onTouchStart: function(e) {
    if (e.touches.length !== 1) return;
    App.canvasExport._startDrag(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  },

  _onTouchMove: function(e) {
    if (!App.canvasExport._dragState || e.touches.length !== 1) return;
    App.canvasExport._moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  },

  // ── Icon preview image (SVG only — raster is drawn directly) ──
  _refreshPreviewImg: function() {
    var state = App.state;
    if (state.canvasMode !== 'icon' || state.fileType !== 'svg') return;
    var svgStr = state._processedSVG || state.svgSource;
    if (!svgStr) return;
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    _previewImg = img; // assign before onload to prevent re-entry
    img.onload = function() {
      URL.revokeObjectURL(url);
      App.canvasExport.renderOverlay();
    };
    img.onerror = function() { URL.revokeObjectURL(url); };
    img.src = url;
  },

  // ── Helpers ──
  _baseName: function() {
    var state = App.state;
    return state.fileName.replace(/\.(svg|png|jpg|jpeg|webp|avif|gif|bmp|tiff?|ico)$/i, '');
  },

  // Parse the processed SVG string into a live documentElement clone ready for manipulation.
  // Always uses _processedSVG (color edits applied) falling back to svgSource (original).
  // APPROVE_WITH_FIXES C-1: must NOT clone state.svgDoc.documentElement.
  _parseSVGString: function() {
    var state = App.state;
    var svgStr = state._processedSVG || state.svgSource;
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgStr, 'image/svg+xml');
    return doc.documentElement.cloneNode(true);
  },

  // Insert a clone into a hidden div for getBBox() to work, call fn(clone), then remove.
  _withLayoutSVG: function(clone, fn) {
    var div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(div);
    div.appendChild(clone);
    try {
      fn(clone);
    } finally {
      document.body.removeChild(div);
    }
  },

  // Rasterize an SVG element at targetW×targetH to a PNG blob, then call cb(blob).
  _rasterizeSVG: function(svgEl, targetW, targetH, cb) {
    svgEl.setAttribute('width', targetW);
    svgEl.setAttribute('height', targetH);
    var serializer = new XMLSerializer();
    var svgStr = serializer.serializeToString(svgEl);
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(cb, 'image/png', 1.0);
    };
    img.src = url;
  },

  // Parse the SVG's viewBox: returns {vbX, vbY, vbW, vbH}.
  // If no viewBox attribute, synthesizes from width/height (APPROVE_WITH_FIXES I-3).
  _parseSVGViewBox: function(svgEl) {
    var vb = svgEl.getAttribute('viewBox');
    if (vb) {
      var parts = vb.trim().split(/[\s,]+/);
      return {
        vbX: parseFloat(parts[0]) || 0,
        vbY: parseFloat(parts[1]) || 0,
        vbW: parseFloat(parts[2]) || App.state.imgWidth,
        vbH: parseFloat(parts[3]) || App.state.imgHeight
      };
    }
    // No viewBox: synthesize from width/height attrs (or imgWidth/imgHeight)
    var w = parseFloat(svgEl.getAttribute('width')) || App.state.imgWidth;
    var h = parseFloat(svgEl.getAttribute('height')) || App.state.imgHeight;
    return { vbX: 0, vbY: 0, vbW: w, vbH: h };
  },

  // ── Icon export ──
  exportIcon: function() {
    var state = App.state;
    var base = App.canvasExport._baseName();
    var iconPad = state.iconPadding !== undefined ? state.iconPadding : 0.1;
    var PAD = Math.round(512 * iconPad);
    var CONTENT = 512 - 2 * PAD;
    var cr = state.cropRect;
    if (!cr) return;

    if (state.fileType === 'svg') {
      // Crop the SVG viewBox to the selected region, then expand outward for padding
      var svgEl = App.canvasExport._parseSVGString();
      var vb = App.canvasExport._parseSVGViewBox(svgEl);
      // Convert crop rect (source-pixel space == viewBox space for SVGs) + add padding margin
      var padSVG = iconPad > 0 ? cr.w * iconPad / (1 - 2 * iconPad) : 0;
      var newVbX = vb.vbX + cr.x - padSVG;
      var newVbY = vb.vbY + cr.y - padSVG;
      var newVbSize = cr.w + 2 * padSVG;

      var ns = 'http://www.w3.org/2000/svg';
      var bgRect = document.createElementNS(ns, 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', state.canvasBgColor);
      svgEl.insertBefore(bgRect, svgEl.firstChild);

      svgEl.setAttribute('viewBox', newVbX + ' ' + newVbY + ' ' + newVbSize + ' ' + newVbSize);
      svgEl.setAttribute('width', '512');
      svgEl.setAttribute('height', '512');

      if (state.canvasKeepSVG) {
        var s = new XMLSerializer();
        var str = s.serializeToString(svgEl);
        var blob = new Blob([str], { type: 'image/svg+xml' });
        App.download.downloadBlob(blob, base + '_icon.svg');
      } else {
        App.canvasExport._rasterizeSVG(svgEl, 512, 512, function(blob) {
          App.download.downloadBlob(blob, base + '_icon.png');
        });
      }

    } else {
      // Raster: sample the selected cropRect region, place into the padded CONTENT area
      var src = state._brushedCanvas || state.processedCanvas || state.originalCanvas;
      if (!src) return;
      var upScale = state.upscale ? state.upscaleScale : 1;
      var canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = state.canvasBgColor;
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(src,
        cr.x * upScale, cr.y * upScale, cr.w * upScale, cr.h * upScale,
        PAD, PAD, CONTENT, CONTENT);
      canvas.toBlob(function(blob) {
        App.download.downloadBlob(blob, base + '_icon.png');
      }, 'image/png', 1.0);
    }
  },

  // ── Logo / Header export ──
  exportCrop: function() {
    var state = App.state;
    var cr = state.cropRect;
    if (!cr) return;
    var base = App.canvasExport._baseName();
    var isLogo = state.canvasMode === 'logo';
    var suffix = isLogo ? '_logo' : '_header';

    // Apply upscale adjustment to cropRect (cropRect is in original-source pixels)
    var scale = state.upscale ? state.upscaleScale : 1;
    var scaledCr = {
      x: Math.round(cr.x * scale),
      y: Math.round(cr.y * scale),
      w: Math.round(cr.w * scale),
      h: Math.round(cr.h * scale)
    };

    // Target output dimensions
    var outW, outH;
    if (isLogo) {
      outH = 512;
      outW = Math.round(512 * cr.w / cr.h);
    } else {
      outW = 1500;
      outH = 500;
    }

    if (state.fileType === 'svg') {
      // SVG path
      var svgEl = App.canvasExport._parseSVGString();
      var vb = App.canvasExport._parseSVGViewBox(svgEl);

      // cropRect is in viewBox user-unit space (imgWidth === vbW per loadSVG)
      // new viewBox = [vbX + cropRect.x, vbY + cropRect.y, cropRect.w, cropRect.h]
      var newVb = (vb.vbX + cr.x) + ' ' + (vb.vbY + cr.y) + ' ' + cr.w + ' ' + cr.h;
      svgEl.setAttribute('viewBox', newVb);
      svgEl.setAttribute('width', outW);
      svgEl.setAttribute('height', outH);

      if (state.canvasAddBg) {
        var ns = 'http://www.w3.org/2000/svg';
        var bgRect = document.createElementNS(ns, 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', state.canvasBgColor);
        svgEl.insertBefore(bgRect, svgEl.firstChild);
      }

      if (state.canvasKeepSVG) {
        var s = new XMLSerializer();
        var str = s.serializeToString(svgEl);
        var blob = new Blob([str], { type: 'image/svg+xml' });
        App.download.downloadBlob(blob, base + suffix + '.svg');
      } else {
        App.canvasExport._rasterizeSVG(svgEl, outW, outH, function(blob) {
          App.download.downloadBlob(blob, base + suffix + '.png');
        });
      }

    } else {
      // Raster path
      var srcCanvas = state._brushedCanvas || state.processedCanvas || state.originalCanvas;
      if (!srcCanvas) return;

      // Clamp scaledCr to actual canvas bounds
      scaledCr.x = Math.max(0, Math.min(scaledCr.x, srcCanvas.width - 1));
      scaledCr.y = Math.max(0, Math.min(scaledCr.y, srcCanvas.height - 1));
      scaledCr.w = Math.max(1, Math.min(scaledCr.w, srcCanvas.width - scaledCr.x));
      scaledCr.h = Math.max(1, Math.min(scaledCr.h, srcCanvas.height - scaledCr.y));

      var outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      var ctx = outCanvas.getContext('2d');

      if (state.canvasAddBg) {
        ctx.fillStyle = state.canvasBgColor;
        ctx.fillRect(0, 0, outW, outH);
      }

      ctx.drawImage(srcCanvas,
        scaledCr.x, scaledCr.y, scaledCr.w, scaledCr.h,
        0, 0, outW, outH
      );

      outCanvas.toBlob(function(blob) {
        App.download.downloadBlob(blob, base + suffix + '.png');
      }, 'image/png', 1.0);
    }
  },
};
