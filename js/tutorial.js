// js/tutorial.js — Guided tour (first use) + help panel
'use strict';

var _tourStep = 0;
var _tourWaiting = false; // true when paused waiting for image upload

var TOUR_STEPS = [
  {
    target: 'dropZone',
    content: '<strong>Step 1: Upload your image</strong><br>Drag and drop a file here, or click to browse. Supports SVG, PNG, JPG, WebP, and more.',
    position: 'bottom',
    waitForFile: true  // pause here until user uploads an image
  },
  {
    target: 'controlsPanel',
    content: '<strong>Quick Presets</strong><br>Click "Make White" or "Make Black" to instantly change your logo\'s main color. Use "Custom Color" to pick any color you want.',
    position: 'right'
  },
  {
    target: 'toleranceRow',
    content: '<strong>Color Tolerance</strong><br>This slider controls how many similar shades get changed. Start low (exact match) and increase until you get the result you want.',
    position: 'bottom'
  },
  {
    target: 'bgRemovalToggle',
    content: '<strong>Remove Background</strong><br>Toggle this on to erase the background. It works from the edges inward so it won\'t damage the logo. Use Threshold and Edge Protection to fine-tune.',
    position: 'right'
  },
  {
    target: 'brushToolbar',
    content: '<strong>Brush Touchup</strong><br>After processing, use <strong>Restore</strong> to bring back areas you want to keep, or <strong>Erase</strong> to remove more background. Ctrl+Z to undo.',
    position: 'bottom'
  },
  {
    target: 'compareModeSelect',
    content: '<strong>Compare Modes</strong><br>Use the dropdown to switch between different before/after views. Drag the vertical slider to compare the original and processed image side by side.',
    position: 'bottom'
  },
  {
    target: 'btnSelective',
    content: '<strong>Selective Mode</strong><br>Click this to protect part of the image from changes. Everything to the left of the slider stays untouched — great for logos with icons you don\'t want to change.',
    position: 'bottom'
  },
  {
    target: 'upscaleToggle',
    content: '<strong>Upscale</strong><br>Make your image bigger and sharper. Choose 2x (double) or 4x (quadruple). Great for low-res logos that need to be used at larger sizes.',
    position: 'right'
  },
  {
    target: 'btnDownload',
    content: '<strong>Download</strong><br>When you\'re happy with the result, click here to save your image. Photos save as high-quality PNG, vector graphics stay as SVG.',
    position: 'top'
  },
  {
    target: 'btnHelpMain',
    content: '<strong>Need help later?</strong><br>Click "Need help?" anytime to open the full help guide with detailed instructions for every feature.',
    position: 'bottom'
  }
];

App.tutorial = {
  // ── Help panel ──
  openHelp: function() {
    App.dom.helpPanel.classList.add('visible');
  },

  closeHelp: function() {
    App.dom.helpPanel.classList.remove('visible');
  },

  // ── Guided tour ──
  startTour: function() {
    _tourStep = 0;
    _tourWaiting = false;
    App.tutorial.showStep();
  },

  showStep: function() {
    var dom = App.dom;
    var step = TOUR_STEPS[_tourStep];
    if (!step) { App.tutorial.endTour(); return; }

    // Remove previous highlight
    var prev = document.querySelector('.tour-highlight');
    if (prev) prev.classList.remove('tour-highlight');

    // Find target element
    var target = document.getElementById(step.target);
    if (target) {
      target.classList.add('tour-highlight');
    }

    // Set content
    dom.tourContent.innerHTML = step.content;
    dom.tourProgress.textContent = (_tourStep + 1) + ' of ' + TOUR_STEPS.length;

    // Show/hide back button
    dom.tourBack.style.display = _tourStep === 0 ? 'none' : '';

    // If this step waits for file upload, change Next button text
    if (step.waitForFile) {
      dom.tourNext.style.display = 'none';
    } else {
      dom.tourNext.style.display = '';
      dom.tourNext.textContent = _tourStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
    }

    // Show overlay and tooltip
    dom.tourOverlay.classList.add('visible');
    dom.tourTooltip.classList.add('visible');

    // Position tooltip near target
    App.tutorial.positionTooltip(target, step.position);

    // If waiting for file, mark as paused so click-through works
    if (step.waitForFile) {
      _tourWaiting = true;
      // Let clicks pass through overlay to the drop zone
      dom.tourOverlay.style.pointerEvents = 'none';
    } else {
      _tourWaiting = false;
      dom.tourOverlay.style.pointerEvents = '';
    }
  },

  // Called by file-handling.js showEditor() when an image is loaded
  resumeTour: function() {
    if (!_tourWaiting) return;
    _tourWaiting = false;
    App.dom.tourOverlay.style.pointerEvents = '';
    // Small delay so the editor has time to render before positioning tooltips
    setTimeout(function() {
      _tourStep++;
      App.tutorial.showStep();
    }, 400);
  },

  positionTooltip: function(target, position) {
    var tooltip = App.dom.tourTooltip;
    if (!target) {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    tooltip.style.transform = '';
    var rect = target.getBoundingClientRect();
    var tw = tooltip.offsetWidth;
    var th = tooltip.offsetHeight;
    var gap = 12;
    var top, left;

    if (position === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tw / 2;
    } else if (position === 'top') {
      top = rect.top - th - gap;
      left = rect.left + rect.width / 2 - tw / 2;
    } else if (position === 'right') {
      top = rect.top + rect.height / 2 - th / 2;
      left = rect.right + gap;
    } else if (position === 'left') {
      top = rect.top + rect.height / 2 - th / 2;
      left = rect.left - tw - gap;
    }

    // Keep within viewport
    left = Math.max(10, Math.min(left, window.innerWidth - tw - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - th - 10));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  },

  nextStep: function() {
    _tourStep++;
    if (_tourStep >= TOUR_STEPS.length) {
      App.tutorial.endTour();
    } else {
      App.tutorial.showStep();
    }
  },

  prevStep: function() {
    if (_tourStep > 0) {
      _tourStep--;
      App.tutorial.showStep();
    }
  },

  endTour: function() {
    var dom = App.dom;
    _tourWaiting = false;
    dom.tourOverlay.classList.remove('visible');
    dom.tourOverlay.style.pointerEvents = '';
    dom.tourTooltip.classList.remove('visible');
    var prev = document.querySelector('.tour-highlight');
    if (prev) prev.classList.remove('tour-highlight');
    try { localStorage.setItem('imageSandbox_tourDone', '1'); } catch(e) {}
  },

  shouldShowTour: function() {
    try { return !localStorage.getItem('imageSandbox_tourDone'); } catch(e) { return false; }
  }
};
