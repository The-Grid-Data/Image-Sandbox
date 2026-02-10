// js/comparison.js — Comparison slider, modes, and layer rendering
'use strict';

var _dragging = false;

App.comparison = {
  COMPARE_LABELS: {
    final:   ['Original', 'Final'],
    color:   ['Original', 'Color Only'],
    bg:      ['Original', 'BG Removed'],
    upscale: ['Pre-upscale', 'Upscaled'],
  },

  updateComparisonLayers: function() {
    var state = App.state;
    var dom = App.dom;
    var mode = state.compareMode;

    if (state.fileType === 'svg') return;
    if (!state.originalCanvas) return;

    var beforeCanvas = state.originalCanvas;
    var afterCanvas = state.processedCanvas;
    var useUpscaleRes = false;

    if (mode === 'color') {
      afterCanvas = state._colorOnlyCanvas || state.processedCanvas;
    } else if (mode === 'bg') {
      afterCanvas = state._bgOnlyCanvas || state.processedCanvas;
    } else if (mode === 'upscale') {
      beforeCanvas = state._preUpscaleCanvas || state.originalCanvas;
      afterCanvas = state.processedCanvas;
      useUpscaleRes = state.upscale;
    }

    if (useUpscaleRes && afterCanvas) {
      var upW = afterCanvas.width;
      var upH = afterCanvas.height;
      App.comparison.renderCanvasToLayer(beforeCanvas, dom.originalLayer, upW, upH);
      App.comparison.renderCanvasToLayer(afterCanvas, dom.processedLayer, upW, upH);
      var sizer = document.createElement('canvas');
      sizer.width = upW; sizer.height = upH;
      sizer.style.maxWidth = '100%';
      sizer.style.maxHeight = '500px';
      sizer.style.objectFit = 'contain';
      sizer.getContext('2d').drawImage(beforeCanvas, 0, 0, upW, upH);
      dom.comparisonSizer.innerHTML = '';
      dom.comparisonSizer.appendChild(sizer);
    } else {
      App.comparison.renderCanvasToLayer(beforeCanvas, dom.originalLayer);
      App.comparison.renderCanvasToLayer(afterCanvas, dom.processedLayer);
      var sizer2 = document.createElement('canvas');
      sizer2.width = state.originalCanvas.width;
      sizer2.height = state.originalCanvas.height;
      sizer2.style.maxWidth = '100%';
      sizer2.style.maxHeight = '500px';
      sizer2.style.objectFit = 'contain';
      sizer2.getContext('2d').drawImage(state.originalCanvas, 0, 0);
      dom.comparisonSizer.innerHTML = '';
      dom.comparisonSizer.appendChild(sizer2);
    }

    // Re-apply brush mask on the after side if applicable
    if (state.brushMask && (mode === 'final' || mode === 'bg' || mode === 'color')) {
      App.bgRemoval.applyBrushToProcessed();
    }
  },

  renderCanvasToLayer: function(srcCanvas, layer, overrideW, overrideH) {
    if (!srcCanvas) return;
    var state = App.state;
    var displayW = overrideW || state.originalCanvas.width;
    var displayH = overrideH || state.originalCanvas.height;
    var display = document.createElement('canvas');
    display.width = displayW;
    display.height = displayH;
    display.style.maxWidth = '100%';
    display.style.maxHeight = '500px';
    display.style.objectFit = 'contain';
    var ctx = display.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, displayW, displayH);
    layer.innerHTML = '';
    layer.appendChild(display);
  },

  updateSlider: function(clientX) {
    var state = App.state;
    var dom = App.dom;
    var rect = dom.comparison.getBoundingClientRect();
    var pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));
    state.sliderPos = pct;
    dom.comparisonHandle.style.left = pct + '%';
    dom.originalLayer.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    dom.processedLayer.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
  },

  isDragging: function() { return _dragging; },
  setDragging: function(val) { _dragging = val; },
};
