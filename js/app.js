// js/app.js — Main init, event wiring, processing dispatcher
'use strict';

var _processingTimer = null;

App.app = {
  applyProcessing: function() {
    clearTimeout(_processingTimer);
    _processingTimer = setTimeout(function() {
      if (App.state.fileType === 'svg') {
        App.colorReplacement.applySVGProcessing();
      } else {
        App.bgRemoval.applyRasterProcessing();
      }
    }, 30);
  },

  clearPresetButtons: function() {
    var dom = App.dom;
    [dom.presetWhite, dom.presetBlack, dom.presetCustom].forEach(function(b) { b.classList.remove('active'); });
  },

  updateBrushToolbar: function() {
    var state = App.state;
    var dom = App.dom;
    var hasRasterProcessing = (state.bgRemoval || state.selectedSourceColor) && state.fileType === 'raster';
    dom.brushToolbar.classList.toggle('active', hasRasterProcessing);
    dom.btnBrushErase.style.display = state.bgRemoval ? '' : 'none';
    if (!hasRasterProcessing) {
      App.bgRemoval.setBrushMode(null);
      state.brushMask = null;
      state.undoStack = []; state.redoStack = []; App.zoomPan.updateUndoRedoButtons();
    }
    if (!state.bgRemoval && state.brushMode === 'erase') {
      App.bgRemoval.setBrushMode(null);
    }
  },
};

// ── Init: wire all events ──
(function init() {
  var state = App.state;
  var dom = App.dom;
  var applyProcessing = App.app.applyProcessing;
  var clearPresetButtons = App.app.clearPresetButtons;

  // Initialize undo/redo button state
  App.zoomPan.updateUndoRedoButtons();

  // ── File upload events ──
  dom.dropZone.addEventListener('click', function() { dom.fileInput.click(); });
  dom.dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
  dom.dropZone.addEventListener('dragleave', function() { dom.dropZone.classList.remove('drag-over'); });
  dom.dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) App.fileHandling.handleFile(e.dataTransfer.files[0]);
  });
  dom.fileInput.addEventListener('change', function() { if (dom.fileInput.files.length) App.fileHandling.handleFile(dom.fileInput.files[0]); });
  dom.btnChangeFile.addEventListener('click', function() { App.fileHandling.resetState(); dom.fileInput.click(); });

  // ── Preset events ──
  dom.presetWhite.addEventListener('click', function() {
    App.colorDetection.pushColorUndo();
    clearPresetButtons();
    dom.presetWhite.classList.add('active');
    state.presetMode = 'white';
    state.colorReplacements = {};
    state.targetColor = '#ffffff';
    dom.targetColorInput.value = '#ffffff';
    dom.targetHexInput.value = '#ffffff';
    dom.targetColorRow.style.display = '';
    if (state.fileType === 'raster') dom.toleranceRow.style.display = '';

    if (state.detectedColors.length) {
      dom.swatchesSection.style.display = '';
      var darkest = state.detectedColors.slice().sort(function(a, b) {
        return App.utils.luminance(App.utils.hexToRgb(a)) - App.utils.luminance(App.utils.hexToRgb(b));
      })[0];
      state.selectedSourceColor = darkest;
      App.colorDetection.renderSwatches();
    }
    App.colorDetection.updateSummary();
    App.app.updateBrushToolbar();
    applyProcessing();
  });

  dom.presetBlack.addEventListener('click', function() {
    App.colorDetection.pushColorUndo();
    clearPresetButtons();
    dom.presetBlack.classList.add('active');
    state.presetMode = 'black';
    state.colorReplacements = {};
    state.targetColor = '#000000';
    dom.targetColorInput.value = '#000000';
    dom.targetHexInput.value = '#000000';
    dom.targetColorRow.style.display = '';
    if (state.fileType === 'raster') dom.toleranceRow.style.display = '';

    if (state.detectedColors.length) {
      dom.swatchesSection.style.display = '';
      var lightest = state.detectedColors.slice()
        .filter(function(c) { return App.utils.colorDistance(App.utils.hexToRgb(c), {r:255,g:255,b:255}) > 30; })
        .sort(function(a, b) { return App.utils.luminance(App.utils.hexToRgb(b)) - App.utils.luminance(App.utils.hexToRgb(a)); })[0]
        || state.detectedColors[0];
      state.selectedSourceColor = lightest;
      App.colorDetection.renderSwatches();
    }
    App.colorDetection.updateSummary();
    App.app.updateBrushToolbar();
    applyProcessing();
  });

  dom.presetCustom.addEventListener('click', function() {
    App.colorDetection.pushColorUndo();
    clearPresetButtons();
    dom.presetCustom.classList.add('active');
    state.presetMode = 'custom';
    state.colorReplacements = {};
    dom.targetColorRow.style.display = '';
    if (state.fileType === 'raster') dom.toleranceRow.style.display = '';
    dom.swatchesSection.style.display = state.detectedColors.length ? '' : 'none';
    App.colorDetection.renderSwatches();
    App.colorDetection.updateSummary();
  });

  // ── Target color events ──
  var _colorInputUndoPushed = false;
  dom.targetColorInput.addEventListener('mousedown', function() {
    // Push undo once when user starts picking a new color
    if (!_colorInputUndoPushed) {
      App.colorDetection.pushColorUndo();
      _colorInputUndoPushed = true;
    }
  });
  dom.targetColorInput.addEventListener('change', function() {
    _colorInputUndoPushed = false; // Reset after picker closes
    App.colorDetection.renderSwatches();
    App.colorDetection.updateSummary();
  });
  dom.targetColorInput.addEventListener('input', function() {
    state.targetColor = dom.targetColorInput.value;
    dom.targetHexInput.value = dom.targetColorInput.value;
    if (state.selectedSourceColor) state.colorReplacements[state.selectedSourceColor] = state.targetColor;
    applyProcessing();
  });

  dom.targetHexInput.addEventListener('change', function() {
    var val = dom.targetHexInput.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      App.colorDetection.pushColorUndo();
      state.targetColor = val.toLowerCase();
      dom.targetColorInput.value = val;
      if (state.selectedSourceColor) state.colorReplacements[state.selectedSourceColor] = state.targetColor;
      App.colorDetection.renderSwatches();
      App.colorDetection.updateSummary();
      applyProcessing();
    }
  });

  // ── Tolerance ──
  dom.toleranceSlider.addEventListener('input', function() {
    state.tolerance = +dom.toleranceSlider.value;
    dom.toleranceValue.textContent = dom.toleranceSlider.value;
    applyProcessing();
  });

  // ── Background removal events ──
  dom.bgRemovalToggle.addEventListener('change', function() {
    state.bgRemoval = dom.bgRemovalToggle.checked;
    dom.bgRemovalOptions.classList.toggle('active', state.bgRemoval);
    if (state.bgRemoval && state.fileType === 'raster' && state.originalData) {
      App.bgRemoval.autoDetectBgColor();
    }
    App.app.updateBrushToolbar();
    applyProcessing();
  });

  dom.bgRemovalColorInput.addEventListener('input', function() {
    state.bgRemovalColor = dom.bgRemovalColorInput.value;
    dom.bgRemovalHexInput.value = dom.bgRemovalColorInput.value;
    state.brushMask = null;
    applyProcessing();
  });

  dom.bgRemovalHexInput.addEventListener('change', function() {
    var val = dom.bgRemovalHexInput.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      state.bgRemovalColor = val.toLowerCase();
      dom.bgRemovalColorInput.value = val;
      state.brushMask = null;
      applyProcessing();
    }
  });

  dom.btnAutoDetectBg.addEventListener('click', function() {
    if (state.fileType === 'raster' && state.originalData) {
      App.bgRemoval.autoDetectBgColor();
      applyProcessing();
    }
  });

  dom.bgThresholdSlider.addEventListener('input', function() {
    state.bgThreshold = +dom.bgThresholdSlider.value;
    dom.bgThresholdValue.textContent = dom.bgThresholdSlider.value;
    state.brushMask = null;
    applyProcessing();
  });

  dom.edgeProtectSlider.addEventListener('input', function() {
    state.edgeProtect = +dom.edgeProtectSlider.value;
    dom.edgeProtectValue.textContent = dom.edgeProtectSlider.value;
    state.brushMask = null;
    applyProcessing();
  });

  // ── Brush touchup events ──
  dom.btnBrushRestore.addEventListener('click', function() { App.bgRemoval.setBrushMode(state.brushMode === 'restore' ? null : 'restore'); });
  dom.btnBrushErase.addEventListener('click', function() { App.bgRemoval.setBrushMode(state.brushMode === 'erase' ? null : 'erase'); });
  dom.btnBrushOff.addEventListener('click', function() { App.bgRemoval.setBrushMode(null); });

  dom.brushSizeSlider.addEventListener('input', function() {
    state.brushSize = +dom.brushSizeSlider.value;
    dom.brushSizeValueEl.textContent = dom.brushSizeSlider.value;
    App.bgRemoval.updateBrushCursor();
  });

  // Brush cursor tracking
  dom.comparison.addEventListener('mousemove', function(e) {
    if (!state.brushMode) return;
    var rect = dom.comparison.getBoundingClientRect();
    dom.brushCursor.style.left = (e.clientX - rect.left) + 'px';
    dom.brushCursor.style.top = (e.clientY - rect.top) + 'px';
  });
  dom.comparison.addEventListener('mouseleave', function() { dom.brushCursor.style.display = 'none'; });
  dom.comparison.addEventListener('mouseenter', function() { if (state.brushMode) dom.brushCursor.style.display = 'block'; });

  // Brush painting (mousedown on comparison)
  dom.comparison.addEventListener('mousedown', function(e) {
    if (state.brushMode && !App.zoomPan.isSpaceHeld()) {
      App.zoomPan.pushUndo();
      App.bgRemoval.setBrushPainting(true);
      App.bgRemoval.paintBrush(e.clientX, e.clientY);
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', function(e) {
    if (App.bgRemoval.isBrushPainting() && state.brushMode) {
      App.bgRemoval.paintBrush(e.clientX, e.clientY);
    }
  });
  window.addEventListener('mouseup', function() { App.bgRemoval.setBrushPainting(false); });

  // Touch brush
  dom.comparison.addEventListener('touchstart', function(e) {
    if (state.brushMode && e.touches.length === 1) {
      App.zoomPan.pushUndo();
      App.bgRemoval.setBrushPainting(true);
      App.bgRemoval.paintBrush(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('touchmove', function(e) {
    if (App.bgRemoval.isBrushPainting() && state.brushMode) {
      App.bgRemoval.paintBrush(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  window.addEventListener('touchend', function() { App.bgRemoval.setBrushPainting(false); });

  // ── Upscale events ──
  dom.upscaleToggle.addEventListener('change', function() {
    state.upscale = dom.upscaleToggle.checked;
    dom.upscaleOptions.classList.toggle('active', state.upscale);
    applyProcessing();
  });

  document.querySelectorAll('.btn-upscale').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.btn-upscale').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.upscaleScale = +btn.dataset.scale;
      if (state.upscale) applyProcessing();
    });
  });

  // ── Preview background events ──
  document.querySelectorAll('.btn-bg').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.btn-bg').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.previewBg = btn.dataset.bg;
      dom.comparisonBg.className = 'comparison-bg-checker';
      if (state.previewBg === 'dark') dom.comparisonBg.classList.add('bg-dark');
      else if (state.previewBg === 'light') dom.comparisonBg.classList.add('bg-light');
    });
  });

  // ── Zoom button events ──
  dom.btnZoomIn.addEventListener('click', function() {
    var rect = dom.comparison.getBoundingClientRect();
    App.zoomPan.setZoom(state.zoom * App.zoomPan.ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  dom.btnZoomOut.addEventListener('click', function() {
    var rect = dom.comparison.getBoundingClientRect();
    App.zoomPan.setZoom(state.zoom / App.zoomPan.ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  dom.btnZoomFit.addEventListener('click', function() { App.zoomPan.zoomToFit(); });

  // Scroll wheel zoom
  dom.comparison.addEventListener('wheel', function(e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? App.zoomPan.ZOOM_SCROLL_STEP : 1 / App.zoomPan.ZOOM_SCROLL_STEP;
    App.zoomPan.setZoom(state.zoom * factor, e.clientX, e.clientY);
  }, { passive: false });

  // ── Pan events (Space+drag, middle-click) ──
  window.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !e.repeat && !['INPUT','SELECT'].includes(document.activeElement && document.activeElement.tagName)) {
      App.zoomPan.setSpaceHeld(true);
      dom.comparison.style.cursor = 'grab';
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function(e) {
    if (e.code === 'Space') {
      App.zoomPan.setSpaceHeld(false);
      if (!App.zoomPan.isPanning()) dom.comparison.style.cursor = state.brushMode ? 'none' : 'col-resize';
    }
  });

  dom.comparison.addEventListener('mousedown', function(e) {
    if (App.zoomPan.isSpaceHeld() || e.button === 1) {
      App.zoomPan.setPanning(true);
      App.zoomPan.setPanStart(e.clientX, e.clientY);
      App.zoomPan.setPanOrigin(state.panX, state.panY);
      dom.comparison.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', function(e) {
    if (App.zoomPan.isPanning()) {
      var start = App.zoomPan.getPanStart();
      var origin = App.zoomPan.getPanOrigin();
      state.panX = origin.x + (e.clientX - start.x);
      state.panY = origin.y + (e.clientY - start.y);
      App.zoomPan.applyZoomTransform();
    }
  });
  window.addEventListener('mouseup', function() {
    if (App.zoomPan.isPanning()) {
      App.zoomPan.setPanning(false);
      dom.comparison.style.cursor = App.zoomPan.isSpaceHeld() ? 'grab' : (state.brushMode ? 'none' : 'col-resize');
    }
  });

  // ── Touch pinch-to-zoom ──
  dom.comparison.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      App.zoomPan.setLastTouchDist(Math.sqrt(dx * dx + dy * dy));
      App.zoomPan.setLastTouchMid({
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      });
      e.preventDefault();
    }
  }, { passive: false });

  dom.comparison.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2 && App.zoomPan.getLastTouchDist() > 0) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      var scale = dist / App.zoomPan.getLastTouchDist();
      App.zoomPan.setZoom(state.zoom * scale, mid.x, mid.y);
      var lastMid = App.zoomPan.getLastTouchMid();
      state.panX += mid.x - lastMid.x;
      state.panY += mid.y - lastMid.y;
      App.zoomPan.applyZoomTransform();
      App.zoomPan.setLastTouchDist(dist);
      App.zoomPan.setLastTouchMid(mid);
      e.preventDefault();
    }
  }, { passive: false });

  dom.comparison.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
      App.zoomPan.setLastTouchDist(0);
      App.zoomPan.setLastTouchMid(null);
    }
  });

  // ── Keyboard zoom shortcuts ──
  window.addEventListener('keydown', function(e) {
    if (['INPUT','SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
    if ((e.key === '=' || e.key === '+') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      var rect = dom.comparison.getBoundingClientRect();
      App.zoomPan.setZoom(state.zoom * App.zoomPan.ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      var rect2 = dom.comparison.getBoundingClientRect();
      App.zoomPan.setZoom(state.zoom / App.zoomPan.ZOOM_STEP, rect2.left + rect2.width / 2, rect2.top + rect2.height / 2);
    } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      App.zoomPan.zoomToFit();
    }
  });

  // ── Undo/redo ──
  dom.btnUndo.addEventListener('click', function() {
    // Try brush undo first, then fall back to color undo
    if (App.state.undoStack.length) {
      App.zoomPan.undo();
    } else {
      App.colorDetection.undoColor();
    }
  });
  dom.btnRedo.addEventListener('click', function() { App.zoomPan.redo(); });
  window.addEventListener('keydown', function(e) {
    if (['INPUT','SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      // Try brush undo first, then fall back to color undo
      if (App.state.undoStack.length) {
        App.zoomPan.undo();
      } else {
        App.colorDetection.undoColor();
      }
    }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); App.zoomPan.redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); App.zoomPan.redo(); }
  });

  // ── Shortcuts popover ──
  dom.btnHelp.addEventListener('click', function(e) {
    e.stopPropagation();
    var isVisible = dom.shortcutsPopover.classList.toggle('visible');
    if (isVisible) {
      var rect = dom.btnHelp.getBoundingClientRect();
      dom.shortcutsPopover.style.top = (rect.bottom + 6) + 'px';
      dom.shortcutsPopover.style.right = (window.innerWidth - rect.right) + 'px';
    }
  });
  document.addEventListener('click', function(e) {
    if (!dom.shortcutsPopover.contains(e.target) && e.target !== dom.btnHelp) {
      dom.shortcutsPopover.classList.remove('visible');
    }
  });

  // ── Comparison mode ──
  dom.compareModeSelect.addEventListener('change', function() {
    state.compareMode = dom.compareModeSelect.value;
    var labels = App.comparison.COMPARE_LABELS[state.compareMode] || ['Before', 'After'];
    dom.labelBefore.textContent = labels[0];
    dom.labelAfter.textContent = labels[1];
    App.comparison.updateComparisonLayers();
  });

  // ── Selective mode ──
  dom.btnSelective.addEventListener('click', function() {
    state.selectiveMode = !state.selectiveMode;
    dom.btnSelective.classList.toggle('active', state.selectiveMode);
    dom.compareModeSelect.style.display = state.selectiveMode ? 'none' : '';
    if (state.selectiveMode) {
      // Disable brush mode — it conflicts with selective slider
      App.bgRemoval.setBrushMode(null);
      dom.labelBefore.textContent = 'Protected';
      dom.labelAfter.textContent = 'Processing';
    } else {
      var labels = App.comparison.COMPARE_LABELS[state.compareMode] || ['Before', 'After'];
      dom.labelBefore.textContent = labels[0];
      dom.labelAfter.textContent = labels[1];
    }
  });

  // ── Comparison slider drag ──
  dom.comparison.addEventListener('mousedown', function(e) {
    if (!state.brushMode && !App.zoomPan.isSpaceHeld() && e.button !== 1) {
      App.comparison.setDragging(true);
      App.comparison.updateSlider(e.clientX);
    }
  });
  window.addEventListener('mousemove', function(e) {
    if (App.comparison.isDragging() && !state.brushMode) App.comparison.updateSlider(e.clientX);
  });
  window.addEventListener('mouseup', function() { App.comparison.setDragging(false); });

  dom.comparison.addEventListener('touchstart', function(e) {
    if (!state.brushMode) { App.comparison.setDragging(true); App.comparison.updateSlider(e.touches[0].clientX); }
  }, { passive: true });
  window.addEventListener('touchmove', function(e) {
    if (App.comparison.isDragging() && !state.brushMode) App.comparison.updateSlider(e.touches[0].clientX);
  }, { passive: true });
  window.addEventListener('touchend', function() { App.comparison.setDragging(false); });

  // ── Download ──
  dom.btnDownload.addEventListener('click', function() {
    if (state.fileType === 'svg') {
      App.download.downloadSVG();
    } else {
      App.download.downloadRaster();
    }
  });

  // ── Help panel ──
  dom.btnHelpMain.addEventListener('click', function() { App.tutorial.openHelp(); });
  dom.helpPanelClose.addEventListener('click', function() { App.tutorial.closeHelp(); });

  // ── Guided tour ──
  dom.tourNext.addEventListener('click', function() { App.tutorial.nextStep(); });
  dom.tourBack.addEventListener('click', function() { App.tutorial.prevStep(); });
  dom.tourSkip.addEventListener('click', function() { App.tutorial.endTour(); });
  // No overlay click-to-dismiss — tour persists until Skip/Finish is clicked

  // Restart tour buttons (footer + help panel)
  dom.btnRestartTour.addEventListener('click', function() { App.tutorial.restartTour(); });
  dom.btnHelpTour.addEventListener('click', function() { App.tutorial.restartTour(); });

  // ── Color undo + Reset all colors ──
  dom.btnColorUndo.addEventListener('click', function() { App.colorDetection.undoColor(); });
  dom.btnResetColors.addEventListener('click', function() { App.colorDetection.resetAllColors(); });

  // Auto-start tour on first visit
  if (App.tutorial.shouldShowTour()) {
    App.tutorial.startTour();
  }
})();
