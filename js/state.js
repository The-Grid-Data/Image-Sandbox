// js/state.js — App namespace root, state object, DOM refs
'use strict';

window.App = {
  state: {
    file: null,
    fileName: '',
    fileType: '',       // 'svg' | 'raster'
    originalFormat: '', // 'svg' | 'png' | 'webp' | 'avif'
    svgSource: '',
    svgDoc: null,
    originalImg: null,
    originalCanvas: null,
    originalData: null,
    processedCanvas: null,
    detectedColors: [],
    selectedSourceColor: null,
    targetColor: '#ffffff',
    colorReplacements: {},  // { '#source': '#target', ... } accumulated mappings
    colorUndoStack: [],     // Array of { replacements, selectedSourceColor, targetColor } snapshots
    tolerance: 30,
    selectiveMode: false,
    bgRemoval: false,
    bgRemovalColor: '#ffffff',
    bgThreshold: 20,
    edgeProtect: 2,
    upscale: false,
    upscaleScale: 2,
    presetMode: null,   // 'white' | 'black' | 'custom' | null
    sliderPos: 50,
    previewBg: 'checker',
    imgWidth: 0,
    imgHeight: 0,
    processing: false,
    brushMode: null,    // null | 'restore' | 'erase'
    brushSize: 20,
    brushMask: null,    // Float32Array manual overrides (persists across reprocessing)
    zoom: 1,
    panX: 0,
    panY: 0,
    undoStack: [],      // Array of Float32Array snapshots
    redoStack: [],
    compareMode: 'final',
    // Intermediate canvases for comparison modes
    _colorOnlyCanvas: null,   // color replacement only (no bg removal, no upscale)
    _bgOnlyCanvas: null,      // bg removal only (no color change, no upscale)
    _preUpscaleCanvas: null,  // final result before upscaling
    _processedSVG: null,
    _brushedCanvas: null,
  },

  $: function(id) { return document.getElementById(id); },

  // DOM ref cache — populated below
  dom: {},
};

// Cache all DOM refs (defer ensures DOM is ready)
(function cacheDom() {
  var $ = App.$;
  var d = App.dom;
  d.comparisonSizer = $('comparisonSizer');
  d.dropZone = $('dropZone');
  d.fileInput = $('fileInput');
  d.editor = $('editor');
  d.fileName = $('fileName');
  d.fileBadge = $('fileBadge');
  d.fileMeta = $('fileMeta');
  d.btnChangeFile = $('btnChangeFile');
  d.presetWhite = $('presetWhite');
  d.presetBlack = $('presetBlack');
  d.presetCustom = $('presetCustom');
  d.swatchesSection = $('swatchesSection');
  d.swatchesEl = $('swatches');
  d.targetColorRow = $('targetColorRow');
  d.targetColorInput = $('targetColor');
  d.targetHexInput = $('targetHex');
  d.toleranceRow = $('toleranceRow');
  d.toleranceSlider = $('toleranceSlider');
  d.toleranceValue = $('toleranceValue');
  d.bgRemovalToggle = $('bgRemovalToggle');
  d.bgRemovalOptions = $('bgRemovalOptions');
  d.bgRemovalColorInput = $('bgRemovalColor');
  d.bgRemovalHexInput = $('bgRemovalHex');
  d.btnAutoDetectBg = $('btnAutoDetectBg');
  d.bgThresholdSlider = $('bgThresholdSlider');
  d.bgThresholdValue = $('bgThresholdValue');
  d.upscaleToggle = $('upscaleToggle');
  d.upscaleOptions = $('upscaleOptions');
  d.comparison = $('comparison');
  d.comparisonBg = $('comparisonBg');
  d.originalLayer = $('originalLayer');
  d.processedLayer = $('processedLayer');
  d.comparisonHandle = $('comparisonHandle');
  d.edgeProtectSlider = $('edgeProtectSlider');
  d.edgeProtectValue = $('edgeProtectValue');
  d.brushToolbar = $('brushToolbar');
  d.btnBrushRestore = $('btnBrushRestore');
  d.btnBrushErase = $('btnBrushErase');
  d.btnBrushOff = $('btnBrushOff');
  d.brushSizeSlider = $('brushSizeSlider');
  d.brushSizeValueEl = $('brushSizeValue');
  d.brushCursor = $('brushCursor');
  d.btnZoomIn = $('btnZoomIn');
  d.btnZoomOut = $('btnZoomOut');
  d.btnZoomFit = $('btnZoomFit');
  d.btnUndo = $('btnUndo');
  d.btnRedo = $('btnRedo');
  d.zoomLevelEl = $('zoomLevel');
  d.comparisonContent = $('comparisonContent');
  d.btnHelp = $('btnHelp');
  d.shortcutsPopover = $('shortcutsPopover');
  d.compareModeSelect = $('compareModeSelect');
  d.btnSelective = $('btnSelective');
  d.labelBefore = $('labelBefore');
  d.labelAfter = $('labelAfter');
  d.btnDownload = $('btnDownload');
  d.downloadInfo = $('downloadInfo');
  d.progressOverlay = $('progressOverlay');
  d.progressFill = $('progressFill');
  d.progressText = $('progressText');
  d.toastContainer = $('toastContainer');
  d.btnHelpMain = $('btnHelpMain');
  d.helpPanel = $('helpPanel');
  d.helpPanelClose = $('helpPanelClose');
  d.tourOverlay = $('tourOverlay');
  d.tourTooltip = $('tourTooltip');
  d.tourContent = $('tourContent');
  d.tourProgress = $('tourProgress');
  d.tourSkip = $('tourSkip');
  d.tourBack = $('tourBack');
  d.tourNext = $('tourNext');
  d.btnResetColors = $('btnResetColors');
  d.btnRestartTour = $('btnRestartTour');
  d.btnHelpTour = $('btnHelpTour');
})();
