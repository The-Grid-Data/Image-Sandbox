// js/file-handling.js — File loading, format detection, state reset
'use strict';

App.fileHandling = {
  resetState: function() {
    var state = App.state;
    var dom = App.dom;
    state.file = null;
    state.svgSource = '';
    state.svgDoc = null;
    state.originalImg = null;
    state.originalCanvas = null;
    state.originalData = null;
    state.processedCanvas = null;
    state.detectedColors = [];
    state.selectedSourceColor = null;
    state.presetMode = null;
    state.processing = false;
    dom.editor.classList.remove('active');
    dom.dropZone.style.display = '';
    dom.originalLayer.innerHTML = '';
    dom.processedLayer.innerHTML = '';
    dom.comparisonSizer.innerHTML = '';
    dom.swatchesEl.innerHTML = '';
    dom.swatchesSection.style.display = 'none';
    dom.targetColorRow.style.display = 'none';
    dom.toleranceRow.style.display = 'none';
    dom.bgRemovalToggle.checked = false;
    dom.bgRemovalOptions.classList.remove('active');
    state.bgRemoval = false;
    state.bgRemovalColor = '#ffffff';
    state.upscale = false;
    state.upscaleScale = 2;
    state.edgeProtect = 2;
    state.brushMode = null;
    state.brushMask = null;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.undoStack = [];
    state.redoStack = [];
    state.compareMode = 'final';
    state.selectiveMode = false;
    state._colorOnlyCanvas = null;
    state._bgOnlyCanvas = null;
    state._preUpscaleCanvas = null;
    dom.compareModeSelect.value = 'final';
    dom.compareModeSelect.style.display = '';
    dom.btnSelective.classList.remove('active');
    dom.upscaleToggle.checked = false;
    dom.upscaleOptions.classList.remove('active');
    dom.brushToolbar.classList.remove('active');
    dom.comparison.classList.remove('brush-mode');
    App.zoomPan.applyZoomTransform();
    App.zoomPan.updateUndoRedoButtons();
    App.app.clearPresetButtons();
  },

  handleFile: function(file) {
    var state = App.state;
    var dom = App.dom;
    var ext = file.name.split('.').pop().toLowerCase();
    var validExts = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'ico'];
    if (!validExts.includes(ext)) {
      App.utils.showToast('Unsupported format. Use SVG, PNG, JPG, WebP, AVIF, GIF, BMP, or TIFF.', 'error');
      return;
    }

    state.file = file;
    state.fileName = file.name;
    state.originalFormat = ext;
    state.fileType = ext === 'svg' ? 'svg' : 'raster';

    if (ext !== 'svg' && ext !== 'png') {
      App.utils.showToast('Will convert from ' + ext.toUpperCase() + ' to PNG on download', 'warning');
    }

    dom.fileName.textContent = file.name;
    dom.fileBadge.textContent = ext.toUpperCase();

    if (state.fileType === 'svg') {
      App.fileHandling.loadSVG(file);
    } else {
      App.fileHandling.loadRaster(file);
    }
  },

  loadSVG: function(file) {
    var state = App.state;
    var dom = App.dom;
    var reader = new FileReader();
    reader.onload = function(e) {
      state.svgSource = e.target.result;
      var parser = new DOMParser();
      state.svgDoc = parser.parseFromString(state.svgSource, 'image/svg+xml');

      var parseErr = state.svgDoc.querySelector('parsererror');
      if (parseErr) {
        App.utils.showToast('Failed to parse SVG file.', 'error');
        return;
      }

      var svgEl = state.svgDoc.documentElement;
      var vb = svgEl.getAttribute('viewBox');
      var w, h;
      if (vb) {
        var parts = vb.split(/[\s,]+/);
        w = Math.round(parseFloat(parts[2]));
        h = Math.round(parseFloat(parts[3]));
      } else {
        w = parseInt(svgEl.getAttribute('width')) || 300;
        h = parseInt(svgEl.getAttribute('height')) || 300;
      }
      state.imgWidth = w;
      state.imgHeight = h;
      dom.fileMeta.textContent = w + ' x ' + h;

      App.colorDetection.detectSVGColors();
      App.fileHandling.showEditor();
      App.colorReplacement.renderOriginalSVG();
      App.colorReplacement.renderProcessedSVG();
    };
    reader.readAsText(file);
  },

  loadRaster: function(file) {
    var state = App.state;
    var dom = App.dom;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function() {
      state.originalImg = img;
      state.imgWidth = img.naturalWidth;
      state.imgHeight = img.naturalHeight;
      dom.fileMeta.textContent = img.naturalWidth + ' x ' + img.naturalHeight;

      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      state.originalCanvas = canvas;
      state.originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      App.colorDetection.detectRasterColors();
      App.fileHandling.showEditor();
      App.bgRemoval.renderOriginalRaster();
      App.bgRemoval.applyRasterProcessing();
      URL.revokeObjectURL(url);
    };
    img.onerror = function() {
      App.utils.showToast('Browser cannot decode this ' + state.originalFormat.toUpperCase() + ' file.', 'error');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  },

  showEditor: function() {
    var dom = App.dom;
    dom.dropZone.style.display = 'none';
    dom.editor.classList.add('active');
    App.download.updateDownloadInfo();
    App.tutorial.resumeTour();
  },
};
