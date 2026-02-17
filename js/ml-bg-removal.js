// js/ml-bg-removal.js — ML-based background removal via ONNX Runtime Web + BRIA RMBG-1.4
'use strict';

App.mlBgRemoval = {
  _session: null,
  _loading: false,

  // Model URL — BRIA RMBG-1.4 quantized ONNX from HuggingFace
  MODEL_URL: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx',
  MODEL_INPUT_SIZE: 1024,

  // ImageNet normalization constants
  MEAN: [0.485, 0.456, 0.406],
  STD:  [0.229, 0.224, 0.225],

  isAvailable: function() {
    return typeof ort !== 'undefined';
  },

  isReady: function() {
    return !!this._session;
  },

  isLoading: function() {
    return this._loading;
  },

  init: function() {
    var self = this;

    if (self._session || self._loading) return Promise.resolve();
    if (!self.isAvailable()) {
      console.warn('[ML BG] ONNX Runtime Web not available');
      return Promise.reject(new Error('ONNX Runtime Web not loaded'));
    }

    self._loading = true;
    App.utils.showToast('Loading AI background removal model... (first time only, ~44 MB)', 'info', 10000);

    // Configure ONNX Runtime
    ort.env.wasm.numThreads = 1; // Avoids COOP/COEP header requirements
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';

    return ort.InferenceSession.create(self.MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    }).then(function(session) {
      self._session = session;
      self._loading = false;
      App.state.mlReady = true;
      App.utils.showToast('AI model loaded! Background removal will now use AI.', 'success', 3000);
      console.log('[ML BG] Model loaded successfully');
      return session;
    }).catch(function(err) {
      self._loading = false;
      App.state.mlReady = false;
      console.error('[ML BG] Failed to load model:', err);
      App.utils.showToast('AI model failed to load. Using standard removal.', 'error', 5000);
      throw err;
    });
  },

  /**
   * Run ML inference to produce a background mask.
   * Returns Float32Array[w*h] where 0.0 = foreground (keep), 1.0 = background (remove).
   * This matches the format expected by the existing pipeline.
   */
  predict: function(srcData, w, h) {
    var self = this;
    if (!self._session) {
      return Promise.reject(new Error('ML session not initialized'));
    }

    var inputSize = self.MODEL_INPUT_SIZE;

    // Step 1: Draw source ImageData onto a temp canvas, resize to model input size
    var srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    var srcCtx = srcCanvas.getContext('2d');
    var imgData = srcCtx.createImageData(w, h);
    imgData.data.set(srcData);
    srcCtx.putImageData(imgData, 0, 0);

    var resizeCanvas = document.createElement('canvas');
    resizeCanvas.width = inputSize;
    resizeCanvas.height = inputSize;
    var resizeCtx = resizeCanvas.getContext('2d');
    resizeCtx.imageSmoothingEnabled = true;
    resizeCtx.imageSmoothingQuality = 'high';
    resizeCtx.drawImage(srcCanvas, 0, 0, inputSize, inputSize);

    var resizedData = resizeCtx.getImageData(0, 0, inputSize, inputSize).data;

    // Step 2: Normalize to [0,1], then apply ImageNet normalization, in CHW format
    var totalInputPixels = inputSize * inputSize;
    var floatData = new Float32Array(3 * totalInputPixels);

    for (var i = 0; i < totalInputPixels; i++) {
      var pi = i * 4;
      // Normalize to [0, 1] then apply (x - mean) / std
      floatData[i]                        = ((resizedData[pi]     / 255.0) - self.MEAN[0]) / self.STD[0]; // R channel
      floatData[i + totalInputPixels]     = ((resizedData[pi + 1] / 255.0) - self.MEAN[1]) / self.STD[1]; // G channel
      floatData[i + 2 * totalInputPixels] = ((resizedData[pi + 2] / 255.0) - self.MEAN[2]) / self.STD[2]; // B channel
    }

    // Step 3: Create ONNX tensor and run inference
    var inputTensor = new ort.Tensor('float32', floatData, [1, 3, inputSize, inputSize]);

    // Get the input name from the model
    var inputName = self._session.inputNames[0];
    var feeds = {};
    feeds[inputName] = inputTensor;

    return self._session.run(feeds).then(function(results) {
      // Step 4: Extract output mask
      var outputName = self._session.outputNames[0];
      var outputTensor = results[outputName];
      var outputData = outputTensor.data; // Float32Array

      // Output shape could be [1, 1, H, W] or [1, H, W] — flatten to 2D
      var outH = outputTensor.dims[outputTensor.dims.length - 2] || inputSize;
      var outW = outputTensor.dims[outputTensor.dims.length - 1] || inputSize;
      var outPixels = outH * outW;

      // Step 5: Sigmoid if values aren't already in [0,1]
      // Check first few values to see if sigmoid is needed
      var needsSigmoid = false;
      for (var si = 0; si < Math.min(100, outPixels); si++) {
        if (outputData[si] < -0.5 || outputData[si] > 1.5) {
          needsSigmoid = true;
          break;
        }
      }

      var modelMask = new Float32Array(outPixels);
      if (needsSigmoid) {
        for (var j = 0; j < outPixels; j++) {
          modelMask[j] = 1.0 / (1.0 + Math.exp(-outputData[j]));
        }
      } else {
        for (var j2 = 0; j2 < outPixels; j2++) {
          modelMask[j2] = Math.max(0, Math.min(1, outputData[j2]));
        }
      }

      // Step 6: Resize mask from model output size back to original image size
      // Use canvas for bilinear interpolation
      var maskCanvas = document.createElement('canvas');
      maskCanvas.width = outW;
      maskCanvas.height = outH;
      var maskCtx = maskCanvas.getContext('2d');
      var maskImgData = maskCtx.createImageData(outW, outH);

      // Model outputs: 1 = foreground, 0 = background
      // Write mask values into all RGBA channels for grayscale representation
      for (var mi = 0; mi < outPixels; mi++) {
        var val = Math.round(modelMask[mi] * 255);
        maskImgData.data[mi * 4]     = val;
        maskImgData.data[mi * 4 + 1] = val;
        maskImgData.data[mi * 4 + 2] = val;
        maskImgData.data[mi * 4 + 3] = 255;
      }
      maskCtx.putImageData(maskImgData, 0, 0);

      // Resize to original dimensions
      var finalCanvas = document.createElement('canvas');
      finalCanvas.width = w;
      finalCanvas.height = h;
      var finalCtx = finalCanvas.getContext('2d');
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(maskCanvas, 0, 0, w, h);
      var finalData = finalCtx.getImageData(0, 0, w, h).data;

      // Step 7: Convert to pipeline-compatible format
      // Our pipeline: 0.0 = foreground (keep), 1.0 = background (remove)
      // Model output: 1 = foreground, 0 = background
      // So we INVERT: pipelineMask[i] = 1.0 - modelValue
      var mask = new Float32Array(w * h);
      for (var fi = 0; fi < w * h; fi++) {
        // Use the R channel (0-255), convert back to [0,1], then invert
        mask[fi] = 1.0 - (finalData[fi * 4] / 255.0);
      }

      return mask;
    });
  }
};
