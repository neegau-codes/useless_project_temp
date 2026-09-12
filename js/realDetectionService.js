/**
 * Real Detection Service - Connects frontend to FastAPI CV Backend (/analyze)
 * 
 * Emits DetectionResult payloads matching the frontend contract expected by App and OverlayRenderer.
 */

export class RealDetectionService {
  /**
   * @param {HTMLVideoElement | (() => HTMLVideoElement)} videoSource - Video element or function returning video element
   * @param {Object} [options]
   * @param {string} [options.apiUrl='http://localhost:8000/analyze']
   * @param {number} [options.intervalMs=700]
   */
  constructor(videoSource, options = {}) {
    this.videoSource = videoSource;
    this.apiUrl = options.apiUrl || 'http://localhost:8000/analyze';
    this.intervalMs = options.intervalMs || 700;

    this.listeners = new Set();
    this.timerId = null;
    this.isAnalyzing = false;
    this.isRunning = false;

    // Create offscreen canvas for frame capture
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');

    // Keep track of latest result
    this.latestResult = this.createEmptyResult('INITIALIZING', 'INITIALIZING OPTICAL SENSORS', 'CONNECTING TO REAL-TIME CV BACKEND...');
  }

  /**
   * Resolve video element from source
   * @returns {HTMLVideoElement|null}
   */
  getVideoElement() {
    if (typeof this.videoSource === 'function') {
      return this.videoSource();
    }
    return this.videoSource || null;
  }

  /**
   * Subscribe to detection result updates
   * @param {function(import('./types.js').DetectionResult): void} listener 
   * @returns {function(): void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.latestResult);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify subscribers of updated result
   */
  notify(result) {
    this.latestResult = result;
    this.listeners.forEach(cb => cb(result));
  }

  /**
   * Start detection loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextLoop(0);
  }

  /**
   * Stop detection loop
   */
  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Restart detection loop
   */
  restart() {
    this.stop();
    this.start();
  }

  /**
   * Schedule next analysis call preventing overlapping requests
   */
  scheduleNextLoop(delayMs = this.intervalMs) {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
    this.timerId = setTimeout(async () => {
      if (!this.isRunning) return;
      await this.analyzeCurrentFrame();
      if (this.isRunning) {
        this.scheduleNextLoop(this.intervalMs);
      }
    }, delayMs);
  }

  /**
   * Capture frame and POST to FastAPI /analyze endpoint
   */
  async analyzeCurrentFrame() {
    if (this.isAnalyzing) return; // Prevent overlapping requests

    const videoEl = this.getVideoElement();
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight || videoEl.paused || videoEl.ended) {
      this.notify(this.createEmptyResult('CAMERA_UNAVAILABLE', 'OPTICAL SENSOR PENDING', 'WAITING FOR LIVE CAMERA STREAM...'));
      return;
    }

    this.isAnalyzing = true;

    try {
      const blob = await this.captureFrameAsBlob(videoEl, 640, 0.85);
      if (!blob) {
        this.notify(this.createEmptyResult('FRAME_ERROR', 'FRAME CAPTURE ERROR', 'UNABLE TO EXTRACT FRAME FROM OPTICAL SENSOR'));
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        this.notify(this.createEmptyResult('HTTP_ERROR', `BACKEND ERROR [HTTP ${response.status}]`, 'CV SERVER RETURNED AN UNEXPECTED STATUS'));
        return;
      }

      const data = await response.json();
      const detectionResult = this.mapBackendResponseToDetectionResult(data);
      this.notify(detectionResult);

    } catch (err) {
      console.warn('RealDetectionService: Backend request failed:', err);
      this.notify(this.createEmptyResult('BACKEND_UNAVAILABLE', 'CV BACKEND OFFLINE', 'EXPECTED AT HTTP://LOCALHOST:8000/ANALYZE'));
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Capture resized image blob from video element
   */
  captureFrameAsBlob(videoEl, targetWidth = 640, quality = 0.85) {
    return new Promise((resolve) => {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const scale = targetWidth / vw;
      const targetHeight = Math.round(vh * scale);

      this.offscreenCanvas.width = targetWidth;
      this.offscreenCanvas.height = targetHeight;

      this.offscreenCtx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
      this.offscreenCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  }

  /**
   * Map FastAPI /analyze JSON response to frontend DetectionResult format
   * @param {Object} data 
   * @returns {import('./types.js').DetectionResult}
   */
  mapBackendResponseToDetectionResult(data) {
    const rawDetections = Array.isArray(data.detections) ? data.detections : [];
    
    if (rawDetections.length === 0) {
      return this.createEmptyResult('READY', 'SEARCHING SCENE FOR SUBJECTS', 'NO VALID SUBJECTS DETECTED IN CAMERA FIELD.');
    }

    const mcObj = data.main_character;
    const amcObj = data.anti_main_character;

    let mainCharId = null;
    let antiCharId = null;

    const frontendDetections = rawDetections.map((det, index) => {
      const detId = `det-${index}`;
      const normBbox = det.normalized_bbox || [0, 0, 0, 0];
      
      // Convert normalized_bbox [xmin, ymin, w, h] to { x, y, width, height }
      const bbox = {
        x: normBbox[0],
        y: normBbox[1],
        width: normBbox[2],
        height: normBbox[3]
      };

      const isMainChar = mcObj && 
        mcObj.normalized_bbox && 
        normBbox.every((val, i) => Math.abs(val - mcObj.normalized_bbox[i]) < 0.001);

      const isAntiMainChar = amcObj && 
        amcObj.normalized_bbox && 
        normBbox.every((val, i) => Math.abs(val - amcObj.normalized_bbox[i]) < 0.001);

      let role = 'npc';
      if (isMainChar) {
        role = 'main_character';
        mainCharId = detId;
      } else if (isAntiMainChar) {
        role = 'anti_main_character';
        antiCharId = detId;
      }

      return {
        id: detId,
        // label omitted for UI abstraction
        score: det.mce_score !== undefined ? det.mce_score : Math.round((det.confidence || 0.5) * 100),
        bbox: bbox,
        role: role,
        statusState: isMainChar ? 'denied' : (isAntiMainChar ? 'focused' : 'active')
      };
    });

    const mcScore = mcObj ? mcObj.mce_score : 0;
    const amcScore = amcObj ? amcObj.mce_score : 0;

    let headline = 'SCANNING SCENE FOR SUBJECTS';
    let subline = 'EVALUATING PERIPHERAL & PROTAGONIST TARGETS...';

    if (mainCharId && antiCharId) {
      headline = 'ANTI-MAIN CHARACTER SELECTED';
      subline = `TARGET FOUND — MCE: ${mcScore}% (MC) VS ${amcScore}% (ANTI-MC).`;
    } else if (mainCharId) {
      headline = 'MAIN CHARACTER DETECTED';
      subline = `MCE: ${mcScore}% — PROTAGONIST SIGNALS DENIED.`;
    }

    return {
      detections: frontendDetections,
      main_character: mainCharId,
      anti_main_character: antiCharId,
      state: 'READY',
      headline: headline,
      subline: subline,
      antiLabel: antiCharId ? 'ANTI-MAIN CHARACTER' : '',
      antiImportance: `${amcScore}%`
    };
  }

  /**
   * Helper to build empty result object
   */
  createEmptyResult(state, headline, subline) {
    return {
      detections: [],
      main_character: null,
      anti_main_character: null,
      state: state,
      headline: headline,
      subline: subline,
      antiLabel: '',
      antiImportance: '0%'
    };
  }
}
