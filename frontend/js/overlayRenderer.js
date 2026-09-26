/**
 * Overlay Renderer - Draws subtle HUD reticles, bounding boxes, and badges on canvas
 */
export class OverlayRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Resize canvas to match display container with High DPI pixel ratio
   */
  resizeToContainer(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }

  /**
   * Clear canvas
   */
  clear() {
    const width = parseFloat(this.canvas.style.width) || this.canvas.width;
    const height = parseFloat(this.canvas.style.height) || this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);
  }

  /**
   * Render DetectionResult payload
   * @param {import('./types.js').DetectionResult} result 
   */
  render(result) {
    const displayWidth = parseFloat(this.canvas.style.width) || this.canvas.width;
    const displayHeight = parseFloat(this.canvas.style.height) || this.canvas.height;

    this.clear();

    if (!result || !result.detections || result.detections.length === 0) {
      return;
    }

    result.detections.forEach(det => {
      const isMC = det.role === 'main_character';
      const isAntiMC = det.role === 'anti_main_character';

      // Convert normalized relative bbox (0 to 1) to canvas pixels
      const x = det.bbox.x * displayWidth;
      const y = det.bbox.y * displayHeight;
      const w = det.bbox.width * displayWidth;
      const h = det.bbox.height * displayHeight;

      if (isMC) {
        this.drawMainCharacterOverlay(x, y, w, h, det, result.state);
      } else if (isAntiMC) {
        this.drawAntiMainCharacterOverlay(x, y, w, h, det, result);
      }
    });
  }

  /**
   * Main Character Overlay (De-emphasized / Avoid reticle)
   */
  drawMainCharacterOverlay(x, y, w, h, det, state) {
    const ctx = this.ctx;

    ctx.save();
    ctx.lineWidth = 1;

    if (state === 'FOCUS_DENIED' || state === 'SEARCHING_NPC' || state === 'ANTI_MC_FOUND' || state === 'READY') {
      // De-focused state - dashed subtle border
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    } else {
      // Active detection state - solid crisp white
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    }

    // Main Box
    ctx.strokeRect(x, y, w, h);

    // Corner reticles
    const cornerSize = 8;
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

    // Top-Left corner
    ctx.beginPath();
    ctx.moveTo(x - 2, y + cornerSize);
    ctx.lineTo(x - 2, y - 2);
    ctx.lineTo(x + cornerSize, y - 2);
    ctx.stroke();

    // Top-Right corner
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y - 2);
    ctx.lineTo(x + w + 2, y - 2);
    ctx.lineTo(x + w + 2, y + cornerSize);
    ctx.stroke();

    // Bottom-Left corner
    ctx.beginPath();
    ctx.moveTo(x - 2, y + h - cornerSize);
    ctx.lineTo(x - 2, y + h + 2);
    ctx.lineTo(x + cornerSize, y + h + 2);
    ctx.stroke();

    // Bottom-Right corner
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y + h + 2);
    ctx.lineTo(x + w + 2, y + h + 2);
    ctx.lineTo(x + w + 2, y + h - cornerSize);
    ctx.stroke();

    // Badge label header above box
    const labelText = state === 'FOCUS_DENIED' || state === 'ANTI_MC_FOUND' || state === 'READY'
      ? "MAIN CHARACTER [FOCUS DENIED]"
      : `MAIN CHARACTER [MCE: ${det.score}%]`;

    ctx.font = '10px "Space Mono", monospace';
    const textWidth = ctx.measureText(labelText).width;
    const padding = 6;
    const badgeHeight = 18;
    const badgeY = y - badgeHeight - 4 < 0 ? y + 4 : y - badgeHeight - 4;

    // Badge background
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(x, badgeY, textWidth + padding * 2, badgeHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, badgeY, textWidth + padding * 2, badgeHeight);

    // Badge square indicator & text
    ctx.fillStyle = '#E5E5E5';
    ctx.fillRect(x + 5, badgeY + 6, 5, 5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, x + 16, badgeY + 13);

    // Bottom telemetry text
    ctx.fillStyle = 'rgba(115, 115, 115, 0.9)';
    ctx.font = '9px "Space Mono", monospace';
    ctx.fillText(`ATTENTION: ${state === 'FOCUS_DENIED' ? '0.00%' : '94.2%'} [AVOID]`, x, y + h + 14);

    ctx.restore();
  }

  /**
   * Anti-Main Character Overlay (Golden Ratio Focus Target)
   */
  drawAntiMainCharacterOverlay(x, y, w, h, det, result) {
    const ctx = this.ctx;

    ctx.save();
    
    // Outer focus stroke
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    // Inner subtle dashed frame
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

    // Corner reticles
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    const cSize = 10;

    // Corners
    ctx.beginPath();
    ctx.moveTo(x - 3, y + cSize); ctx.lineTo(x - 3, y - 3); ctx.lineTo(x + cSize, y - 3);
    ctx.moveTo(x + w - cSize, y - 3); ctx.lineTo(x + w + 3, y - 3); ctx.lineTo(x + w + 3, y + cSize);
    ctx.moveTo(x - 3, y + h - cSize); ctx.lineTo(x - 3, y + h + 3); ctx.lineTo(x + cSize, y + h + 3);
    ctx.moveTo(x + w - cSize, y + h + 3); ctx.lineTo(x + w + 3, y + h + 3); ctx.lineTo(x + w + 3, y + h - cSize);
    ctx.stroke();

    // Top Badge Label
    const labelText = `TARGET [GOLDEN RATIO FOCUS]`;
    ctx.font = '10px "Space Mono", monospace';
    const textWidth = ctx.measureText(labelText).width;
    const padding = 6;
    const badgeHeight = 18;
    const badgeY = y - badgeHeight - 4 < 0 ? y + 4 : y - badgeHeight - 4;

    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(x, badgeY, textWidth + padding * 2, badgeHeight);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, badgeY, textWidth + padding * 2, badgeHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 5, badgeY + 6, 6, 6);
    ctx.fillText(labelText, x + 16, badgeY + 13);

    // Bottom Telemetry
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '9px "Space Mono", monospace';
    ctx.fillText(`PRIORITY: 99.4% — IMPORTANCE: ${result.antiImportance || '7%'}`, x, y + h + 14);

    ctx.restore();
  }
}
