/**
 * Real Detection Service - Connects frontend to FastAPI CV Backend (/analyze)
 * 
 * Emits DetectionResult payloads matching the frontend contract expected by App and OverlayRenderer.
 */

const PRODUCTION_API_URL = 'https://useless-project-temp-004j.onrender.com/analyze';

// Request timeout in milliseconds (60 seconds) to accommodate Render cold starts
const REQUEST_TIMEOUT_MS = 60000;

export class RealDetectionService {
  /**
   * @param {HTMLVideoElement | (() => HTMLVideoElement)} videoSource - Video element or function returning video element
   * @param {Object} [options]
   * @param {string} [options.apiUrl]
   * @param {number} [options.intervalMs=700]
   */
  constructor(videoSource, options = {}) {
    this.videoSource = videoSource;
    // Explicitly use the production URL unless a development URL is intentionally passed
    this.apiUrl = options.apiUrl || PRODUCTION_API_URL;
    
    // Prevent accidental localhost fallback in production domain
    if (typeof window !== 'undefined' && window.location.hostname === 'ayn-nee-etha.vercel.app') {
      this.apiUrl = PRODUCTION_API_URL;
    }

    this.intervalMs = options.intervalMs || 700;

    this.listeners = new Set();
    this.timerId = null;
    this.isAnalyzing = false;
    this.isRunning = false;

    // Track whether the very first request has been attempted yet
    this.isFirstRequest = true;

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
   * Capture frame and POST to FastAPI /analyze endpoint.
   * - Uses REQUEST_TIMEOUT_MS (60 s) to survive Render cold starts.
   * - Guards against overlapping requests via this.isAnalyzing.
   * - Shows a non-error "CONNECTING" state on the first request.
   * - Retries exactly once after a short delay on timeout/network failure.
   */
  async analyzeCurrentFrame() {
    if (this.isAnalyzing) return; // Prevent overlapping requests

    const videoEl = this.getVideoElement();
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight || videoEl.paused || videoEl.ended) {
      this.notify(this.createEmptyResult('CAMERA_UNAVAILABLE', 'OPTICAL SENSOR PENDING', 'WAITING FOR LIVE CAMERA STREAM...'));
      return;
    }

    this.isAnalyzing = true;

    // On the very first request, show a non-error connecting state
    const isFirstAttempt = this.isFirstRequest;
    if (isFirstAttempt) {
      this.notify(this.createEmptyResult('CONNECTING', 'CONNECTING TO CV BACKEND...', 'INITIALIZING RENDER SERVER — PLEASE WAIT...'));
    }

    try {
      const blob = await this.captureFrameAsBlob(videoEl, 640, 0.85);
      if (!blob) {
        this.notify(this.createEmptyResult('FRAME_ERROR', 'FRAME CAPTURE ERROR', 'UNABLE TO EXTRACT FRAME FROM OPTICAL SENSOR'));
        return;
      }

      // Inner helper: send one attempt and return { data } on success or throw
      const sendRequest = async (frameBlob) => {
        const formData = new FormData();
        formData.append('file', frameBlob, 'frame.jpg');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            body: formData,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const err = new Error(`HTTP ${response.status}`);
            err.type = 'HTTP_ERROR';
            err.status = response.status;
            throw err;
          }

          const data = await response.json().catch(() => {
            const err = new Error('Invalid JSON');
            err.type = 'INVALID_RESPONSE';
            throw err;
          });

          return data;
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      };

      let data;
      try {
        data = await sendRequest(blob);
      } catch (firstErr) {
        // Decide error category
        const isAbort = firstErr.name === 'AbortError';
        const isNetwork = !isAbort && firstErr.type !== 'HTTP_ERROR' && firstErr.type !== 'INVALID_RESPONSE';

        if (isAbort || isNetwork) {
          // Show connecting state during the retry delay instead of an error
          this.notify(this.createEmptyResult('CONNECTING', 'CONNECTING TO CV BACKEND...', 'RETRYING — RENDER SERVER MAY BE WAKING UP...'));

          // Wait 3 seconds then retry exactly once
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Capture a fresh frame for the retry
          const retryBlob = await this.captureFrameAsBlob(videoEl, 640, 0.85);
          if (!retryBlob) {
            this.notify(this.createEmptyResult('FRAME_ERROR', 'FRAME CAPTURE ERROR', 'UNABLE TO EXTRACT FRAME FROM OPTICAL SENSOR'));
            return;
          }

          try {
            data = await sendRequest(retryBlob);
          } catch (retryErr) {
            // Final failure after retry
            const isRetryAbort = retryErr.name === 'AbortError';
            if (isRetryAbort) {
              this.notify(this.createEmptyResult('TIMEOUT', 'CV BACKEND TIMEOUT', 'RENDER SERVER DID NOT RESPOND IN TIME — TRY AGAIN SHORTLY'));
            } else if (retryErr.type === 'HTTP_ERROR') {
              this.notify(this.createEmptyResult('HTTP_ERROR', `BACKEND ERROR [HTTP ${retryErr.status}]`, 'CV SERVER RETURNED AN UNEXPECTED STATUS'));
            } else if (retryErr.type === 'INVALID_RESPONSE') {
              this.notify(this.createEmptyResult('INVALID_RESPONSE', 'INVALID BACKEND RESPONSE', 'CV SERVER RETURNED MALFORMED DATA'));
            } else {
              this.notify(this.createEmptyResult('NETWORK_ERROR', 'CV BACKEND UNAVAILABLE', 'COULD NOT REACH SERVER OR CORS FAILURE'));
            }
            return;
          }
        } else if (firstErr.type === 'HTTP_ERROR') {
          this.notify(this.createEmptyResult('HTTP_ERROR', `BACKEND ERROR [HTTP ${firstErr.status}]`, 'CV SERVER RETURNED AN UNEXPECTED STATUS'));
          return;
        } else if (firstErr.type === 'INVALID_RESPONSE') {
          this.notify(this.createEmptyResult('INVALID_RESPONSE', 'INVALID BACKEND RESPONSE', 'CV SERVER RETURNED MALFORMED DATA'));
          return;
        } else {
          this.notify(this.createEmptyResult('NETWORK_ERROR', 'CV BACKEND UNAVAILABLE', 'COULD NOT REACH SERVER OR CORS FAILURE'));
          return;
        }
      }

      // Successful response — mark first request done and map to detection result
      this.isFirstRequest = false;
      const detectionResult = this.mapBackendResponseToDetectionResult(data);
      this.notify(detectionResult);

    } catch (err) {
      console.warn('RealDetectionService: Backend request failed:', err);
      this.notify(this.createEmptyResult(
        'BACKEND_UNAVAILABLE',
        'CV BACKEND OFFLINE',
        'UNEXPECTED ERROR DURING ANALYSIS'
      ));
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
