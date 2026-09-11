/**
 * Main Application Orchestrator for AYN NEE ETHA
 */
import { CameraService } from './cameraService.js';
import { MockDetectionService } from './mockDetectionService.js';
import { OverlayRenderer } from './overlayRenderer.js';
import { CaptureService } from './captureService.js';

class App {
  constructor() {
    this.cameraService = new CameraService();
    this.detectionService = new MockDetectionService();
    this.overlayRenderer = null;
    this.captureService = new CaptureService();

    this.videoEl = null;
    this.canvasEl = null;
    this.currentResult = null;
    this.archiveShots = [];

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.bindEvents();

    // Setup overlay renderer
    if (this.canvasEl) {
      this.overlayRenderer = new OverlayRenderer(this.canvasEl);
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Subscribe to detection service updates
    this.detectionService.subscribe((result) => {
      this.currentResult = result;
      this.updateTelemetryConsole(result);
      if (this.overlayRenderer) {
        this.overlayRenderer.render(result);
      }
    });

    // Setup Camera listeners
    this.cameraService.onError((errorMsg) => {
      this.showCameraError(errorMsg);
    });

    this.cameraService.onStreamReady(() => {
      this.hideCameraError();
      this.resizeCanvas();
      // Start detection state machine
      this.detectionService.start();
    });

    // Start camera stream automatically
    await this.cameraService.startCamera(this.videoEl);
  }

  cacheDOM() {
    this.videoEl = document.getElementById('camera-feed');
    this.canvasEl = document.getElementById('detection-canvas');
    this.cameraErrorEl = document.getElementById('camera-error-overlay');
    this.cameraErrorMsgEl = document.getElementById('camera-error-msg');

    // Telemetry console
    this.headlineEl = document.getElementById('ai-status-headline');
    this.sublineEl = document.getElementById('ai-status-subline');
    this.timestampEl = document.getElementById('log-timestamp');
    this.feedStatusEl = document.getElementById('feed-status');

    // Buttons
    this.shutterBtn = document.getElementById('shutter-button');
    this.flipCameraBtn = document.getElementById('flip-camera-btn');
    this.retryCameraBtn = document.getElementById('retry-camera-btn');
    this.viewModeToggleBtn = document.getElementById('view-mode-toggle');
    this.scenarioToggleBtn = document.getElementById('scenario-toggle-btn');
    
    // Screens & Modals
    this.cameraScreen = document.getElementById('camera-screen');
    this.galleryScreen = document.getElementById('gallery-screen');
    this.resultModal = document.getElementById('result-modal');
    this.settingsModal = document.getElementById('settings-modal');
    
    // Result Screen Elements
    this.resultPhoto = document.getElementById('result-photo');
    this.resultAntiLabel = document.getElementById('result-anti-label');
    this.resultMceScore = document.getElementById('result-mce-score');
    this.resultImportance = document.getElementById('result-importance');
    this.resultReason = document.getElementById('result-reason');
    this.resultStatusBadge = document.getElementById('result-status-badge');
  }

  bindEvents() {
    // Shutter capture click
    if (this.shutterBtn) {
      this.shutterBtn.addEventListener('click', () => this.handleShutterClick());
    }

    // Flip camera
    if (this.flipCameraBtn) {
      this.flipCameraBtn.addEventListener('click', async () => {
        await this.cameraService.flipCamera();
        const mode = this.cameraService.getFacingMode();
        if (this.feedStatusEl) {
          this.feedStatusEl.textContent = mode === 'user' ? 'FRONT_SENSOR_ACTIVE' : 'REAR_SENSOR_PERSPECTIVE';
        }
      });
    }

    // Retry camera permission
    if (this.retryCameraBtn) {
      this.retryCameraBtn.addEventListener('click', () => {
        this.cameraService.startCamera(this.videoEl);
      });
    }

    // Scenario Simulation toggle
    if (this.scenarioToggleBtn) {
      this.scenarioToggleBtn.addEventListener('click', () => {
        const scenarios = ['default_chair', 'bystander_npc'];
        const nextIdx = (scenarios.indexOf(this.detectionService.activeScenarioKey) + 1) % scenarios.length;
        this.detectionService.setScenario(scenarios[nextIdx]);
      });
    }

    // Navigation toggle (Camera <-> Gallery)
    if (this.viewModeToggleBtn) {
      this.viewModeToggleBtn.addEventListener('click', () => this.toggleViewMode());
    }
    const returnToShutterBtn = document.getElementById('return-to-shutter-btn');
    if (returnToShutterBtn) {
      returnToShutterBtn.addEventListener('click', () => this.toggleViewMode('camera'));
    }

    // Modal dismiss / retake / save / share
    const dismissBtn = document.getElementById('retake-btn');
    if (dismissBtn) dismissBtn.addEventListener('click', () => this.dismissResultModal());

    const saveBtn = document.getElementById('save-archive-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveCurrentShot());

    const shareBtn = document.getElementById('share-proof-btn');
    if (shareBtn) shareBtn.addEventListener('click', () => this.shareCurrentShot());

    // Settings Modal
    const openSettingsBtn = document.getElementById('open-settings-btn');
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    const acceptSettingsBtn = document.getElementById('accept-settings-btn');
    if (acceptSettingsBtn) acceptSettingsBtn.addEventListener('click', () => this.closeSettingsModal());

    // ESC key listener for modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.dismissResultModal();
        this.closeSettingsModal();
      }
    });
  }

  resizeCanvas() {
    if (!this.videoEl || !this.canvasEl || !this.overlayRenderer) return;
    const rect = this.videoEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.overlayRenderer.resizeToContainer(rect.width, rect.height);
      if (this.currentResult) {
        this.overlayRenderer.render(this.currentResult);
      }
    }
  }

  updateTelemetryConsole(result) {
    if (!result) return;

    if (this.headlineEl) {
      this.headlineEl.style.opacity = '0';
      setTimeout(() => {
        this.headlineEl.textContent = result.headline || 'OPTICAL SENSOR ACTIVE';
        this.headlineEl.style.opacity = '1';
      }, 150);
    }

    if (this.sublineEl) {
      this.sublineEl.style.opacity = '0';
      setTimeout(() => {
        this.sublineEl.textContent = result.subline || 'SCANNING PERIPHERAL FIELD...';
        this.sublineEl.style.opacity = '1';
      }, 150);
    }

    if (this.timestampEl) {
      const now = new Date();
      this.timestampEl.textContent = now.toTimeString().split(' ')[0] + '.' + Math.floor(Math.random() * 90 + 10);
    }
  }

  showCameraError(msg) {
    if (this.cameraErrorMsgEl) {
      this.cameraErrorMsgEl.textContent = msg;
    }
    if (this.cameraErrorEl) {
      this.cameraErrorEl.classList.remove('hidden');
      this.cameraErrorEl.classList.add('flex');
    }
  }

  hideCameraError() {
    if (this.cameraErrorEl) {
      this.cameraErrorEl.classList.add('hidden');
      this.cameraErrorEl.classList.remove('flex');
    }
  }

  handleShutterClick() {
    // 1. Flash effect
    const flash = document.getElementById('flash-overlay');
    if (flash) {
      flash.classList.remove('shutter-flash');
      void flash.offsetWidth;
      flash.classList.add('shutter-flash');
    }

    // 2. Capture actual video frame with focus & de-emphasis
    const capturedDataUrl = this.captureService.captureFrame(this.videoEl, this.currentResult);

    if (capturedDataUrl) {
      this.lastCapturedDataUrl = capturedDataUrl;
      if (this.resultPhoto) {
        this.resultPhoto.src = capturedDataUrl;
      }
    }

    // 3. Populate result modal metadata
    if (this.resultAntiLabel) this.resultAntiLabel.innerHTML = `<span class="w-2 h-2 bg-white"></span>ANTI-MAIN CHARACTER PRIORITIZED`;
    if (this.resultMceScore) this.resultMceScore.textContent = '4%';
    if (this.resultImportance) this.resultImportance.textContent = this.currentResult?.antiImportance || '7%';
    if (this.resultReason) this.resultReason.textContent = '"Nobody was paying attention to it."';
    if (this.resultStatusBadge) this.resultStatusBadge.textContent = '⭐ NOW THE MAIN CHARACTER';

    // 4. Show result modal after brief freeze
    setTimeout(() => {
      if (this.resultModal) {
        this.resultModal.classList.remove('hidden');
        this.resultModal.classList.add('flex');
      }
    }, 450);
  }

  dismissResultModal() {
    if (this.resultModal) {
      this.resultModal.classList.add('hidden');
      this.resultModal.classList.remove('flex');
    }
    // Restart detection state machine loop
    this.detectionService.restart();
  }

  saveCurrentShot() {
    if (this.lastCapturedDataUrl) {
      this.archiveShots.unshift({
        url: this.lastCapturedDataUrl,
        label: 'NPC STUDY',
        timestamp: new Date().toLocaleString()
      });
      alert(`NPC STUDY SAVED TO ARCHIVE. Protagonist was not notified.`);
    }
    this.dismissResultModal();
  }

  shareCurrentShot() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      alert("Direct proof of protagonist dismissal link copied to clipboard.");
    }
  }

  toggleViewMode(forcedMode) {
    const isCurrentlyGallery = !this.galleryScreen.classList.contains('hidden');
    const targetMode = forcedMode || (isCurrentlyGallery ? 'camera' : 'gallery');

    if (targetMode === 'gallery') {
      this.cameraScreen.classList.add('hidden');
      this.galleryScreen.classList.remove('hidden');
      this.galleryScreen.classList.add('flex');
      if (this.viewModeToggleBtn) this.viewModeToggleBtn.textContent = "LIVE CAMERA";
    } else {
      this.galleryScreen.classList.add('hidden');
      this.galleryScreen.classList.remove('flex');
      this.cameraScreen.classList.remove('hidden');
      if (this.viewModeToggleBtn) this.viewModeToggleBtn.textContent = `ARCHIVE [${this.archiveShots.length || 3}]`;
      this.resizeCanvas();
    }
  }

  openSettingsModal() {
    if (this.settingsModal) {
      this.settingsModal.classList.remove('hidden');
      this.settingsModal.classList.add('flex');
    }
  }

  closeSettingsModal() {
    if (this.settingsModal) {
      this.settingsModal.classList.add('hidden');
      this.settingsModal.classList.remove('flex');
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.aynApp = new App();
});
