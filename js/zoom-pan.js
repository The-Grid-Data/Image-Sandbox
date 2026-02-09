// js/zoom-pan.js — Zoom, pan, undo/redo
'use strict';

var _panning = false;
var _panStartX = 0, _panStartY = 0;
var _panOriginX = 0, _panOriginY = 0;
var _spaceHeld = false;
var _lastTouchDist = 0;
var _lastTouchMid = null;

var ZOOM_MIN = 0.25;
var ZOOM_MAX = 8;
var ZOOM_STEP = 1.15;
var ZOOM_SCROLL_STEP = 1.06;
var MAX_UNDO = 30;

App.zoomPan = {
  ZOOM_STEP: ZOOM_STEP,
  ZOOM_SCROLL_STEP: ZOOM_SCROLL_STEP,

  setZoom: function(level, pivotX, pivotY) {
    var state = App.state;
    var dom = App.dom;
    var oldZoom = state.zoom;
    var newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
    if (newZoom === oldZoom) return;

    if (pivotX !== undefined && pivotY !== undefined) {
      var rect = dom.comparison.getBoundingClientRect();
      var px = pivotX - rect.left;
      var py = pivotY - rect.top;
      state.panX = px - (px - state.panX) * (newZoom / oldZoom);
      state.panY = py - (py - state.panY) * (newZoom / oldZoom);
    }

    state.zoom = newZoom;
    App.zoomPan.applyZoomTransform();
  },

  zoomToFit: function() {
    var state = App.state;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    App.zoomPan.applyZoomTransform();
  },

  applyZoomTransform: function() {
    var state = App.state;
    var dom = App.dom;
    var z = state.zoom;
    dom.comparisonContent.style.transform = z === 1 && state.panX === 0 && state.panY === 0
      ? ''
      : 'translate(' + state.panX + 'px, ' + state.panY + 'px) scale(' + z + ')';
    dom.zoomLevelEl.textContent = Math.round(z * 100) + '%';
    dom.comparison.style.overflow = z <= 1 ? 'hidden' : 'hidden';
  },

  pushUndo: function() {
    var state = App.state;
    if (!state.processedCanvas) return;
    var w = state.processedCanvas.width;
    var h = state.processedCanvas.height;
    var snapshot = state.brushMask
      ? new Float32Array(state.brushMask)
      : new Float32Array(w * h);
    state.undoStack.push(snapshot);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack.length = 0;
    App.zoomPan.updateUndoRedoButtons();
  },

  undo: function() {
    var state = App.state;
    if (state.undoStack.length === 0) return;
    if (state.brushMask) {
      state.redoStack.push(new Float32Array(state.brushMask));
    }
    state.brushMask = state.undoStack.pop();
    App.bgRemoval.applyBrushToProcessed();
    App.zoomPan.updateUndoRedoButtons();
  },

  redo: function() {
    var state = App.state;
    if (state.redoStack.length === 0) return;
    if (state.brushMask) {
      state.undoStack.push(new Float32Array(state.brushMask));
    }
    state.brushMask = state.redoStack.pop();
    App.bgRemoval.applyBrushToProcessed();
    App.zoomPan.updateUndoRedoButtons();
  },

  updateUndoRedoButtons: function() {
    var state = App.state;
    var dom = App.dom;
    dom.btnUndo.style.opacity = state.undoStack.length > 0 ? '1' : '0.4';
    dom.btnRedo.style.opacity = state.redoStack.length > 0 ? '1' : '0.4';
  },

  // Expose pan state for app.js event wiring
  isPanning: function() { return _panning; },
  setPanning: function(val) { _panning = val; },
  isSpaceHeld: function() { return _spaceHeld; },
  setSpaceHeld: function(val) { _spaceHeld = val; },
  getPanStart: function() { return { x: _panStartX, y: _panStartY }; },
  setPanStart: function(x, y) { _panStartX = x; _panStartY = y; },
  getPanOrigin: function() { return { x: _panOriginX, y: _panOriginY }; },
  setPanOrigin: function(x, y) { _panOriginX = x; _panOriginY = y; },
  getLastTouchDist: function() { return _lastTouchDist; },
  setLastTouchDist: function(val) { _lastTouchDist = val; },
  getLastTouchMid: function() { return _lastTouchMid; },
  setLastTouchMid: function(val) { _lastTouchMid = val; },
};
