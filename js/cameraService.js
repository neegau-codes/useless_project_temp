/**
 * Camera Service - Independent MediaStream controller for AYN NEE ETHA
 */
export class CameraService {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.facingMode = 'user'; // Front camera default
    this.isStreaming = false;
    this.onErrorCallback = null;
    this.onStreamReadyCallback = null;
  }

  /**
   * Bind error and stream listeners
   */
  onError(cb) {
    this.onErrorCallback = cb;
  }

  onStreamReady(cb) {
    this.onStreamReadyCallback = cb;
  }

  /**
   * Initialize and attach webcam to the provided video element
   * @param {HTMLVideoElement} videoEl 
   */
  async startCamera(videoEl) {
    if (videoEl) {
      this.videoElement = videoEl;
    }

    if (!this.videoElement) {
      console.error('CameraService: No video element provided');
      return false;
    }

    // Stop existing stream if running
    this.stopCamera();

    try {
      // First try ideal constraints, fallback to true if failed
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (e) {
        console.warn('CameraService: Ideal constraints failed, falling back to basic video constraint', e);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      this.stream = stream;
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', '');
      
      await new Promise((resolve) => {
        if (this.videoElement.readyState >= 2) {
          this.videoElement.play().catch(e => console.error('Play error:', e));
          this.isStreaming = true;
          resolve();
        } else {
          this.videoElement.onloadedmetadata = () => {
            this.videoElement.play().catch(e => console.error('Play error:', e));
            this.isStreaming = true;
            resolve();
          };
        }
      });

      if (this.onStreamReadyCallback) {
        this.onStreamReadyCallback({
          facingMode: this.facingMode,
          width: this.videoElement.videoWidth,
          height: this.videoElement.videoHeight
        });
      }

      return true;
    } catch (err) {
      console.error('CameraService Error:', err);
      this.isStreaming = false;
      let errorMsg = 'UNABLE TO ACCESS OPTICAL SENSOR';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'CAMERA PERMISSION DENIED. PLEASE ALLOW ACCESS TO RESUME.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'NO OPTICAL SENSOR FOUND ON THIS TERMINAL.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'CAMERA IS ALREADY IN USE BY ANOTHER APPLICATION.';
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(errorMsg, err);
      }
      return false;
    }
  }

  /**
   * Toggle between front and rear cameras
   */
  async flipCamera() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    return await this.startCamera();
  }

  /**
   * Stop video stream
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isStreaming = false;
  }

  getFacingMode() {
    return this.facingMode;
  }

  getVideoDimensions() {
    if (!this.videoElement || !this.isStreaming) {
      return { width: 1280, height: 720 };
    }
    return {
      width: this.videoElement.videoWidth || 1280,
      height: this.videoElement.videoHeight || 720
    };
  }
}
