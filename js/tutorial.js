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
    fallback: 'controlsPanel',
    content: '<strong>Color Tolerance</strong><br>After selecting a color, a tolerance slider appears here. It controls how many similar shades get changed. Start low and increase until you get the result you want.',
    position: 'bottom'
  },
  {
    target: 'bgRemovalRow',
    content: '<strong>Remove Background</strong><br>Toggle this on to erase the background. It works from the edges inward so it won\'t damage the logo. Use Threshold and Edge Protection to fine-tune.',
    position: 'right'
  },
  {
    target: 'brushToolbar',
    fallback: 'previewPanel',
    content: '<strong>Brush Touchup</strong><br>After changing colors or removing the background, a toolbar appears here. Use <strong>Restore</strong> to bring back areas, or <strong>Erase</strong> to remove more. Ctrl+Z to undo.',
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
    target: 'upscaleRow',
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
    _tourWaiting = false;
    // If an image is already loaded, skip the "upload" step
    _tourStep = App.state.fileType ? 1 : 0;
    App.tutorial.showStep();
  },

  showStep: function() {
    var dom = App.dom;
    var step = TOUR_STEPS[_tourStep];
    if (!step) { App.tutorial.endTour(); return; }

    // Resolve visible target: try primary, then fallback
    var target = App.tutorial._resolveTarget(step);

    // Temporarily unlock scroll so scrollIntoView can work
    document.body.style.overflow = '';

    // Scroll target into view so off-screen elements are visible
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Brief delay so scroll settles before measuring positions
    setTimeout(function() {
      // Lock page scroll now that scrollIntoView has settled
      document.body.style.overflow = 'hidden';

      // Apply clip-path cutout on overlay so the target shows through
      App.tutorial._applyCutout(target);

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
        dom.tourOverlay.style.pointerEvents = 'none';
      } else {
        _tourWaiting = false;
        dom.tourOverlay.style.pointerEvents = '';
      }
    }, target ? 300 : 0);
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
    dom.tourOverlay.style.clipPath = '';
    dom.tourTooltip.classList.remove('visible');
    // Remove highlight ring if present
    var ring = document.querySelector('.tour-ring');
    if (ring) ring.remove();
    // Unlock page scroll
    document.body.style.overflow = '';
    try { localStorage.setItem('imageSandbox_tourDone', '1'); } catch(e) {}
  },

  // Check if an element is visible and has dimensions
  _isVisible: function(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  },

  // Resolve which element to highlight: primary target if visible, else fallback
  _resolveTarget: function(step) {
    var primary = document.getElementById(step.target);
    if (App.tutorial._isVisible(primary)) return primary;
    if (step.fallback) {
      var fb = document.getElementById(step.fallback);
      if (App.tutorial._isVisible(fb)) return fb;
    }
    return null;
  },

  // Cut a rectangular hole in the overlay so the target element is visible
  _applyCutout: function(target) {
    var overlay = App.dom.tourOverlay;

    // Remove previous ring
    var oldRing = document.querySelector('.tour-ring');
    if (oldRing) oldRing.remove();

    if (!target) {
      overlay.style.clipPath = '';
      return;
    }

    var pad = 6;
    var rect = target.getBoundingClientRect();
    var x = rect.left - pad;
    var y = rect.top - pad;
    var w = rect.width + pad * 2;
    var h = rect.height + pad * 2;
    var r = 6; // border-radius for the cutout

    // clip-path: polygon that covers the full viewport with a rectangular hole
    // Using evenodd fill rule via clip-path with an inset path approach:
    // Outer rect (full screen) + inner rect (hole) wound in opposite direction
    var vw = '100vw';
    var vh = '100vh';
    var path = 'polygon(evenodd, ' +
      // Outer rectangle (clockwise)
      '0 0, ' + vw + ' 0, ' + vw + ' ' + vh + ', 0 ' + vh + ', 0 0, ' +
      // Inner rectangle (counter-clockwise = hole)
      x + 'px ' + y + 'px, ' +
      x + 'px ' + (y + h) + 'px, ' +
      (x + w) + 'px ' + (y + h) + 'px, ' +
      (x + w) + 'px ' + y + 'px, ' +
      x + 'px ' + y + 'px' +
    ')';
    overlay.style.clipPath = path;

    // Add a visible ring around the target (separate element, fixed-position)
    var ring = document.createElement('div');
    ring.className = 'tour-ring';
    ring.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;width:' + w + 'px;height:' + h + 'px;z-index:905;pointer-events:none;';
    document.body.appendChild(ring);
  },

  shouldShowTour: function() {
    try { return !localStorage.getItem('imageSandbox_tourDone'); } catch(e) { return false; }
  },

  restartTour: function() {
    try { localStorage.removeItem('imageSandbox_tourDone'); } catch(e) {}
    // Close help panel if open
    App.tutorial.closeHelp();
    App.tutorial.startTour();
  }
};
