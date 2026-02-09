// js/utils.js — Shared helper functions
'use strict';

App.utils = {
  showToast: function(msg, type) {
    if (type === undefined) type = 'success';
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    App.dom.toastContainer.appendChild(el);
    setTimeout(function() { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2500);
    setTimeout(function() { el.remove(); }, 2800);
  },

  showProgress: function(pct, text) {
    App.dom.progressOverlay.classList.add('active');
    App.dom.progressFill.style.width = pct + '%';
    if (text) App.dom.progressText.textContent = text;
  },

  hideProgress: function() {
    App.dom.progressOverlay.classList.remove('active');
    App.dom.progressFill.style.width = '0%';
  },

  normalizeColor: function(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    if (str === 'none' || str === 'transparent' || str === 'inherit') return null;

    // Named colors - use canvas trick
    if (!str.startsWith('#') && !str.startsWith('rgb')) {
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = str;
      str = ctx.fillStyle; // returns hex
    }

    if (str.startsWith('#')) {
      if (str.length === 4) str = '#' + str[1]+str[1] + str[2]+str[2] + str[3]+str[3];
      return str.toLowerCase();
    }

    var m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return App.utils.rgbToHex(+m[1], +m[2], +m[3]);
    return null;
  },

  rgbToHex: function(r, g, b) {
    return '#' + [r, g, b].map(function(v) { return v.toString(16).padStart(2, '0'); }).join('');
  },

  hexToRgb: function(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return { r: parseInt(hex.slice(0,2), 16), g: parseInt(hex.slice(2,4), 16), b: parseInt(hex.slice(4,6), 16) };
  },

  colorDistance: function(a, b) {
    return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
  },

  luminance: function(rgb) {
    var channels = [rgb.r, rgb.g, rgb.b].map(function(v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  },
};
