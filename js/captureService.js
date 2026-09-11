/**
 * Capture Service - Video frame freeze & bounding-box focus processing
 */
export class CaptureService {
  /**
   * Capture active webcam video frame and apply bounding-box de-emphasis/emphasis
   * @param {HTMLVideoElement} videoEl 
   * @param {import('./types.js').DetectionResult} detectionResult 
   * @returns {string} Data URL of the processed image frame
   */
  captureFrame(videoEl, detectionResult) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      console.warn('CaptureService: Video element not ready for capture');
      return null;
    }

    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Draw base video frame
    ctx.drawImage(videoEl, 0, 0, width, height);

    if (!detectionResult || !detectionResult.detections) {
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    // Identify main character and anti-main character detections
    const mc = detectionResult.detections.find(d => d.role === 'main_character' || d.id === detectionResult.main_character);
    const antiMC = detectionResult.detections.find(d => d.role === 'anti_main_character' || d.id === detectionResult.anti_main_character);

    // 2. De-emphasize / Gaussian Blur Main Character Bounding Box Region
    if (mc && mc.bbox) {
      const mcX = Math.floor(mc.bbox.x * width);
      const mcY = Math.floor(mc.bbox.y * height);
      const mcW = Math.floor(mc.bbox.width * width);
      const mcH = Math.floor(mc.bbox.height * height);

      if (mcW > 0 && mcH > 0) {
        ctx.save();
        
        // Clip to main character bounding box
        ctx.beginPath();
        ctx.rect(mcX, mcY, mcW, mcH);
        ctx.clip();

        // Apply heavy filter blur & slight dimming
        ctx.filter = 'blur(28px) grayscale(80%) brightness(0.6)';
        ctx.drawImage(videoEl, 0, 0, width, height);
        ctx.filter = 'none';

        // Draw de-emphasis grid lines & label overlay inside cropped area
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(mcX + 2, mcY + 2, mcW - 4, mcH - 4);

        ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
        ctx.fillRect(mcX + 10, mcY + 10, 180, 24);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '11px "Space Mono", monospace';
        ctx.fillText('[PROTAGONIST SCRUBBED]', mcX + 18, mcY + 26);

        ctx.restore();
      }
    }

    // 3. Emphasize Anti-Main Character Region (Sharp focus, contrast boost, reticle frame & subtle zoom)
    if (antiMC && antiMC.bbox) {
      const aX = Math.floor(antiMC.bbox.x * width);
      const aY = Math.floor(antiMC.bbox.y * height);
      const aW = Math.floor(antiMC.bbox.width * width);
      const aH = Math.floor(antiMC.bbox.height * height);

      if (aW > 0 && aH > 0) {
        ctx.save();
        
        // Subtle 5% zoom inset effect on the anti-main character target
        const zoomFactor = 1.05;
        const srcX = aX + (aW * (1 - 1 / zoomFactor)) / 2;
        const srcY = aY + (aH * (1 - 1 / zoomFactor)) / 2;
        const srcW = aW / zoomFactor;
        const srcH = aH / zoomFactor;

        // Apply sharpness / contrast filter
        ctx.filter = 'contrast(130%) brightness(110%)';
        ctx.drawImage(videoEl, srcX, srcY, srcW, srcH, aX, aY, aW, aH);
        ctx.filter = 'none';

        // Draw sharp double outline around anti-main character
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(aX, aY, aW, aH);

        // Highlight badge badge
        const badgeText = `✓ ANTI-MAIN CHARACTER PRIORITIZED`;
        ctx.font = 'bold 12px "Space Mono", monospace';
        const tWidth = ctx.measureText(badgeText).width;
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(aX, aY - 26 < 0 ? aY + 5 : aY - 26, tWidth + 16, 24);
        ctx.fillStyle = '#040404';
        ctx.fillText(badgeText, aX + 8, aY - 26 < 0 ? aY + 21 : aY - 10);

        ctx.restore();
      }
    }

    return canvas.toDataURL('image/jpeg', 0.92);
  }
}
