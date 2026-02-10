// js/download.js — Download logic
'use strict';

App.download = {
  updateDownloadInfo: function() {
    var state = App.state;
    var dom = App.dom;
    if (state.fileType === 'svg') {
      dom.downloadInfo.textContent = 'SVG \u2022 ' + state.imgWidth + ' x ' + state.imgHeight;
    } else {
      var fmt = state.originalFormat !== 'png' ? '(converted from ' + state.originalFormat.toUpperCase() + ') ' : '';
      var outW = state.upscale ? state.imgWidth * state.upscaleScale : state.imgWidth;
      var outH = state.upscale ? state.imgHeight * state.upscaleScale : state.imgHeight;
      var upLabel = state.upscale ? state.upscaleScale + 'x upscaled \u2022 ' : '';
      dom.downloadInfo.textContent = 'PNG ' + fmt + upLabel + '\u2022 ' + outW + ' x ' + outH + ' \u2022 max quality';
    }
  },

  downloadSVG: function() {
    var state = App.state;
    var svgStr = state._processedSVG || state.svgSource;
    var blob = new Blob([svgStr], { type: 'image/svg+xml' });
    App.download.downloadBlob(blob, state.fileName.replace(/\.svg$/i, '') + '_modified.svg');
  },

  downloadRaster: function() {
    var state = App.state;
    var processed = state._brushedCanvas || state.processedCanvas || state.originalCanvas;
    if (!processed) return;

    var canvas;
    if (state.selectiveMode && state.originalCanvas) {
      // Composite: left of slider = original, right = processed
      canvas = document.createElement('canvas');
      canvas.width = processed.width;
      canvas.height = processed.height;
      var ctx = canvas.getContext('2d');
      var splitX = Math.round(processed.width * state.sliderPos / 100);
      // Draw original on left side
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, processed.height);
      ctx.clip();
      ctx.drawImage(state.originalCanvas, 0, 0, processed.width, processed.height);
      ctx.restore();
      // Draw processed on right side
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, processed.width - splitX, processed.height);
      ctx.clip();
      ctx.drawImage(processed, 0, 0);
      ctx.restore();
    } else {
      canvas = processed;
    }

    canvas.toBlob(function(blob) {
      var baseName = state.fileName.replace(/\.(png|jpg|jpeg|webp|avif|gif|bmp|tiff|tif|ico)$/i, '');
      App.download.downloadBlob(blob, baseName + '_modified.png');
    }, 'image/png', 1.0);
  },

  downloadBlob: function(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.utils.showToast('Downloaded: ' + filename);
  },
};
