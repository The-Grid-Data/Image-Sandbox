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

    // Create overlay on the outer viewport (comparison), not comparisonContent.
    // The overlay covers the viewport in screen space; all drawing uses explicit world→screen coords.
    _overlayDiv = document.createElement('div');
    _overlayDiv.className = 'canvas-overlay';
    _overlayCanvas = document.createElement('canvas');
    _overlayDiv.appendChild(_overlayCanvas);
    dom.comparison.appendChild(_overlayDiv);
    _overlayCtx = _overlayCanvas.getContext('2d');

    App.canvasExport._registerOverlayEvents();
    if (type === 'icon') App.canvasExport._refreshPreviewImg();
    App.canvasExport.renderOverlay();
    App.canvasExport.fitToCanvasFrame();
  },

  // ── Zoom/pan so the crop frame + image are both fully visible with margin ──
  fitToCanvasFrame: function() {
    if (!App.state.canvasMode || !App.state.cropRect) return;
    var t = App.canvasExport._getImageTransform();
    var cr = App.state.cropRect;
    var dom = App.dom;
    var containerW = dom.comparison.offsetWidth || 1;
    var containerH = dom.comparison.offsetHeight || 1;

    // Bounding box of image union crop frame in overlay-canvas pixels
    var imgX1 = t.offsetX, imgY1 = t.offsetY;
    var imgX2 = t.offsetX + App.state.imgWidth * t.scale;
    var imgY2 = t.offsetY + App.state.imgHeight * t.scale;
    var frX1 = t.offsetX + cr.x * t.scale;
    var frY1 = t.offsetY + cr.y * t.scale;
    var frX2 = t.offsetX + (cr.x + cr.w) * t.scale;
    var frY2 = t.offsetY + (cr.y + cr.h) * t.scale;
    var bX1 = Math.min(imgX1, frX1), bY1 = Math.min(imgY1, frY1);
    var bX2 = Math.max(imgX2, frX2), bY2 = Math.max(imgY2, frY2);
    var bW = bX2 - bX1, bH = bY2 - bY1;
    var bcX = (bX1 + bX2) / 2, bcY = (bY1 + bY2) / 2;

    // Zoom to fit bounds with 20% margin; don't zoom in beyond the normal fit
    var MARGIN = 0.20;
    var fitW = containerW / (bW || 1);
    var fitH = containerH / (bH || 1);
    var Z = Math.min(fitW, fitH) * (1 - 2 * MARGIN);
    Z = Math.max(0.05, Math.min(Z, 1));

    // Pan to center the bounding box: for CSS transform translate(pX,pY) scale(Z)
    // with transform-origin: 0 0, content point (cx,cy) lands at screen = cx*Z + pX.
    // Solving for screen = containerW/2: pX = containerW/2 - cx*Z
    var pX = containerW / 2 - bcX * Z;
    var pY = containerH / 2 - bcY * Z;

    App.state.zoom = Z;
    App.state.panX = pX;
    App.state.panY = pY;
    App.zoomPan.applyZoomTransform();
    App.canvasExport.renderOverlay();
  },

  // ── Fit icon frame to contain the full source image (centered, with bg outside image bounds) ──
  fitIconToImage: function() {
    var state = App.state;
    if (state.canvasMode !== 'icon') return;
    var src = App.canvasExport._getSourceDimensions();
    var sqSize = Math.max(src.w, src.h);
    state.cropRect = {
      x: -Math.round((sqSize - src.w) / 2),
      y: -Math.round((sqSize - src.h) / 2),
      w: sqSize,
      h: sqSize
    };
    // Zoom out so the full frame is visible — the frame may be larger than the current viewport
    if (App.zoomPan) {
      var t = App.canvasExport._getImageTransform();
      var containerW = App.dom.comparisonContent.offsetWidth || 1;
      var containerH = App.dom.comparisonContent.offsetHeight || 1;
      var framePxW = sqSize * t.scale;
      var framePxH = sqSize * t.scale;
      var currentZoom = App.state.zoom || 1;
      // Required zoom to show the full frame with 10% breathing room
      var zoomNeeded = Math.min(currentZoom, 0.9 * Math.min(containerW / framePxW, containerH / framePxH) * currentZoom);
      if (zoomNeeded < currentZoom) App.zoomPan.setZoom(zoomNeeded);
    }
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
  // Images render with max-width:100%, max-height:500px — images never upscale beyond
  // their natural size (only downscale to fit). The min(1,...) enforces that cap.
  // The container may be taller than the image (min-height:200px CSS floor), so we cannot
  // use containerW/src.w and containerH/src.h independently — they diverge for short images.
  _getImageTransform: function() {
    var src = App.canvasExport._getSourceDimensions();
    var state = App.state;
    var dom = App.dom;
    var containerW = dom.comparisonContent.offsetWidth || 1;
    var containerH = dom.comparisonContent.offsetHeight || 1;
    var MAX_H = 500;
    // For upscaled rasters the sizer canvas is upscaleScale× larger, so the effective
    // rendered size (before hitting the max constraints) is src × upscaleScale.
    // SVGs are never raster-upscaled by the current pipeline, so upScale stays 1 for them.
    var upScale = (state.upscale && state.fileType !== 'svg') ? (state.upscaleScale || 1) : 1;
    var scale = Math.min(upScale, containerW / src.w, MAX_H / src.h);
    var renderedW = src.w * scale;
    var renderedH = src.h * scale;
    return {
      scale: scale,
      offsetX: (containerW - renderedW) / 2,
      offsetY: (containerH - renderedH) / 2
    };
  },

  // ── Render the crop frame overlay ──
  // The overlay canvas is a child of dom.comparison (the viewport), so all drawing
  // uses explicit world→screen coordinates rather than relying on CSS transform.
  renderOverlay: function() {
    if (!_overlayCanvas || !_overlayCtx) return;
    var state = App.state;
    var dom = App.dom;

    // Size the canvas to the outer viewport (comparison), NOT comparisonContent
    var containerW = dom.comparison.offsetWidth;
    var containerH = dom.comparison.offsetHeight;
    if (!containerW || !containerH) return;

    _overlayCanvas.width = containerW;
    _overlayCanvas.height = containerH;

    var ctx = _overlayCtx;
    ctx.clearRect(0, 0, containerW, containerH);

    var t = App.canvasExport._getImageTransform();
    var Z  = App.state.zoom  || 1;
    var panX = App.state.panX || 0;
    var panY = App.state.panY || 0;

    // Convert image-space coords to screen-space using: screen = content * Z + pan
    var srcDims = App.canvasExport._getSourceDimensions();
    var imgX = t.offsetX * Z + panX;
    var imgY = t.offsetY * Z + panY;
    var imgW = srcDims.w * t.scale * Z;
    var imgH = srcDims.h * t.scale * Z;

    if (state.canvasMode === 'icon') {
      var cr = state.cropRect;
      if (!cr) return;
      var fX = (t.offsetX + cr.x * t.scale) * Z + panX;
      var fY = (t.offsetY + cr.y * t.scale) * Z + panY;
      var fW = cr.w * t.scale * Z;
      var fH = cr.h * t.scale * Z;

      // Dark overlay outside frame
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, containerW, fY);
      ctx.fillRect(0, fY + fH, containerW, containerH - fY - fH);
      ctx.fillRect(0, fY, fX, fH);
      ctx.fillRect(fX + fW, fY, containerW - fX - fW, fH);

      // Inside the frame: fill bg color then composite the image on top (clip to frame bounds).
      // This makes transparent image areas show the chosen bg color, matching the actual export.
      var bgFill = state.canvasBgColor || '#ffffff';
      ctx.save();
      ctx.beginPath();
      ctx.rect(fX, fY, fW, fH);
      ctx.clip();
      ctx.fillStyle = bgFill;
      ctx.fillRect(fX, fY, fW, fH);
      if (state.fileType === 'svg' && _previewImg && _previewImg.complete && _previewImg.naturalWidth) {
        ctx.drawImage(_previewImg, imgX, imgY, imgW, imgH);
      } else if (state.fileType !== 'svg') {
        var srcCanvas = state._brushedCanvas || state.processedCanvas || state.originalCanvas;
        if (srcCanvas) ctx.drawImage(srcCanvas, imgX, imgY, imgW, imgH);
      }
      ctx.restore();

      // Frame border
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeRect(fX, fY, fW, fH);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fX, fY, fW, fH);

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

      var fX = (t.offsetX + cr.x * t.scale) * Z + panX;
      var fY = (t.offsetY + cr.y * t.scale) * Z + panY;
      var fW = cr.w * t.scale * Z;
      var fH = cr.h * t.scale * Z;

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
    var rect = App.dom.comparison.getBoundingClientRect();
    var t  = App.canvasExport._getImageTransform();
    var Z  = App.state.zoom  || 1;
    var pX = App.state.panX  || 0;
    var pY = App.state.panY  || 0;
    return {
      x: ((screenX - rect.left - pX) / Z - t.offsetX) / t.scale,
      y: ((screenY - rect.top  - pY) / Z - t.offsetY) / t.scale
    };
  },

  // Returns 'interior' | 'left' | 'right' | 'top' | 'bottom' | 'corner-tl/tr/bl/br' | null
  _hitZone: function(screenX, screenY) {
    var state = App.state;
    if (!state.cropRect) return null;
    if (!_overlayCanvas) return null;
    var cr = state.cropRect;
    var rect = App.dom.comparison.getBoundingClientRect();
    var t    = App.canvasExport._getImageTransform();
    var Z    = App.state.zoom  || 1;
    var pX   = App.state.panX  || 0;
    var pY   = App.state.panY  || 0;
    var fX   = rect.left + (t.offsetX + cr.x * t.scale) * Z + pX;
    var fY   = rect.top  + (t.offsetY + cr.y * t.scale) * Z + pY;
    var fW   = cr.w * t.scale * Z;
    var fH   = cr.h * t.scale * Z;
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
    // Infinite canvas: no position constraints — the frame can be dragged anywhere.
    // Only enforce minimum size to keep the frame interactive.
    if (App.state.canvasMode === 'icon') {
      cr.w = Math.max(10, cr.w);
      cr.h = cr.w;
    } else {
      cr.w = Math.max(10, cr.w);
      cr.h = Math.max(10, cr.h);
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
      cr.x = Math.round(o.x + dx);
      cr.y = Math.round(o.y + dy);
      // No clamping — infinite canvas: the frame can be dragged anywhere

    } else if (ds.zone.indexOf('corner-') === 0) {
      // Icon mode: resize the 1:1 square; opposite corner is the anchor.
      // Frame may extend beyond image bounds — out-of-bounds areas fill with bg color on export.
      var corner = ds.zone;
      var anchorX = (corner === 'corner-tl' || corner === 'corner-bl') ? o.x + o.w : o.x;
      var anchorY = (corner === 'corner-tl' || corner === 'corner-tr') ? o.y + o.h : o.y;
      // No maxSize cap — infinite canvas allows any frame size
      var newSize = Math.max(10, Math.max(Math.abs(sp.x - anchorX), Math.abs(sp.y - anchorY)));
      cr.w = Math.round(newSize);
      cr.h = Math.round(newSize);
      cr.x = Math.round((corner === 'corner-tl' || corner === 'corner-bl') ? anchorX - newSize : anchorX);
      cr.y = Math.round((corner === 'corner-tl' || corner === 'corner-tr') ? anchorY - newSize : anchorY);
      // No _clampCropRect — w === h is guaranteed, out-of-bounds is intentional

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
    var PAD = 0;
    var CONTENT = 512;
    var cr = state.cropRect;
    if (!cr) return;

    if (state.fileType === 'svg') {
      // Crop the SVG viewBox to the selected region, then expand outward for padding
      var svgEl = App.canvasExport._parseSVGString();
      var vb = App.canvasExport._parseSVGViewBox(svgEl);
      // Convert crop rect (source-pixel space == viewBox space for SVGs)
      var newVbX = vb.vbX + cr.x;
      var newVbY = vb.vbY + cr.y;
      var newVbSize = cr.w;

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
      // Compute intersection of crop region with actual source bounds (handles out-of-bounds frames)
      var cropSX = cr.x * upScale;
      var cropSY = cr.y * upScale;
      var cropSW = cr.w * upScale;
      var cropSH = cr.h * upScale;
      var iSX = Math.max(cropSX, 0);
      var iSY = Math.max(cropSY, 0);
      var iSX2 = Math.min(cropSX + cropSW, src.width);
      var iSY2 = Math.min(cropSY + cropSH, src.height);
      if (iSX2 > iSX && iSY2 > iSY) {
        var iSW = iSX2 - iSX;
        var iSH = iSY2 - iSY;
        var dX = PAD + (iSX - cropSX) / cropSW * CONTENT;
        var dY = PAD + (iSY - cropSY) / cropSH * CONTENT;
        var dW = iSW / cropSW * CONTENT;
        var dH = iSH / cropSH * CONTENT;
        ctx.drawImage(src, iSX, iSY, iSW, iSH, dX, dY, dW, dH);
      }
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
      var newVb = (vb.vbX + cr.x) + ' ' + (vb.vbY + cr.y) + ' ' + cr.w + ' ' + cr.h;
      svgEl.setAttribute('viewBox', newVb);
      svgEl.setAttribute('width', outW);
      svgEl.setAttribute('height', outH);

      var outOfBounds = cr.x < 0 || cr.y < 0 || cr.x + cr.w > vb.vbW || cr.y + cr.h > vb.vbH;
      if (state.canvasAddBg || outOfBounds) {
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

      var outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      var ctx = outCanvas.getContext('2d');

      // Intersection of crop rect with source canvas (handles out-of-bounds frames)
      var iSX = Math.max(scaledCr.x, 0);
      var iSY = Math.max(scaledCr.y, 0);
      var iSX2 = Math.min(scaledCr.x + scaledCr.w, srcCanvas.width);
      var iSY2 = Math.min(scaledCr.y + scaledCr.h, srcCanvas.height);

      if (state.canvasAddBg || scaledCr.x < 0 || scaledCr.y < 0 || iSX2 > srcCanvas.width || iSY2 > srcCanvas.height) {
        ctx.fillStyle = state.canvasBgColor;
        ctx.fillRect(0, 0, outW, outH);
      }

      if (iSX2 > iSX && iSY2 > iSY) {
        var iSW = iSX2 - iSX;
        var iSH = iSY2 - iSY;
        var dX = (iSX - scaledCr.x) / scaledCr.w * outW;
        var dY = (iSY - scaledCr.y) / scaledCr.h * outH;
        var dW = iSW / scaledCr.w * outW;
        var dH = iSH / scaledCr.h * outH;
        ctx.drawImage(srcCanvas, iSX, iSY, iSW, iSH, dX, dY, dW, dH);
      }

      outCanvas.toBlob(function(blob) {
        App.download.downloadBlob(blob, base + suffix + '.png');
      }, 'image/png', 1.0);
    }
  },
};
