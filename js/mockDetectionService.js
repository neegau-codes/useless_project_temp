/**
 * Mock Detection Service - Deterministic CV Simulation Engine for AYN NEE ETHA
 * 
 * Provides standardized DetectionResult payloads and drives the telemetry state machine over time.
 * Can be swapped with RealDetectionService without modifying UI or capture components.
 */

export class MockDetectionService {
  constructor() {
    this.listeners = new Set();
    this.timerId = null;
    this.currentStepIndex = 0;
    this.activeScenarioKey = 'default_chair';

    // Configurable Scenarios (Normalized relative coordinates 0.0 to 1.0)
    this.scenarios = {
      default_chair: {
        name: "Standard Chair Scenario",
        main_character_id: "person-1",
        anti_main_character_id: "chair-1",
        anti_label: "CHAIR",
        anti_importance: "7%",
        detections: [
          {
            id: "person-1",
            label: "person",
            score: 94,
            bbox: { x: 0.12, y: 0.14, width: 0.36, height: 0.70 },
            role: "main_character"
          },
          {
            id: "chair-1",
            label: "chair",
            score: 7,
            bbox: { x: 0.58, y: 0.32, width: 0.30, height: 0.50 },
            role: "anti_main_character"
          }
        ]
      },
      bystander_npc: {
        name: "Crosswalk Bystander Scenario",
        main_character_id: "person-hero",
        anti_main_character_id: "npc-bystander",
        anti_label: "NPC 04 (PASSENGER)",
        anti_importance: "3%",
        detections: [
          {
            id: "person-hero",
            label: "person",
            score: 98,
            bbox: { x: 0.20, y: 0.10, width: 0.40, height: 0.75 },
            role: "main_character"
          },
          {
            id: "npc-bystander",
            label: "bystander",
            score: 3,
            bbox: { x: 0.68, y: 0.25, width: 0.22, height: 0.55 },
            role: "anti_main_character"
          }
        ]
      }
    };

    // State machine steps with timing (ms) and copy
    this.timeline = [
      {
        step: "INITIALIZING",
        delay: 1000,
        headline: "INITIALIZING OPTICAL SENSORS",
        subline: "CALIBRATING DISMISSIVE ALGORITHMS...",
        showMC: false,
        showAntiMC: false
      },
      {
        step: "SCANNING",
        delay: 2000,
        headline: "SCANNING SCENE FOR SUBJECTS",
        subline: "EVALUATING PERIPHERAL & PROTAGONIST TARGETS...",
        showMC: false,
        showAntiMC: false
      },
      {
        step: "MC_DETECTED",
        delay: 2500,
        headline: "MAIN CHARACTER DETECTED",
        subline: "MCE: 94% — PROTAGONIST SIGNALS DETECTED.",
        showMC: true,
        mcState: "active",
        showAntiMC: false
      },
      {
        step: "FOCUS_DENIED",
        delay: 2500,
        headline: "FOCUS DENIED",
        subline: "PROTAGONIST EXTINCTION PROTOCOL ENGAGED.",
        showMC: true,
        mcState: "denied",
        showAntiMC: false
      },
      {
        step: "SEARCHING_NPC",
        delay: 2200,
        headline: "SEARCHING FOR ANTI-MAIN CHARACTERS",
        subline: "SCANNING BACKGROUND UTILITIES & EXTRAS...",
        showMC: true,
        mcState: "denied",
        showAntiMC: false
      },
      {
        step: "ANTI_MC_FOUND",
        delay: 2500,
        headline: "ANTI-MAIN CHARACTER SELECTED",
        subline: `TARGET FOUND — PHOTOGRAPHIC IMPORTANCE: ${this.scenarios[this.activeScenarioKey].anti_importance}.`,
        showMC: true,
        mcState: "denied",
        showAntiMC: true
      },
      {
        step: "READY",
        delay: 0, // Stays in ready state until capture or manual reset
        headline: "READY TO CAPTURE",
        subline: "PRESS SHUTTER TO CONFIRM DISREGARD.",
        showMC: true,
        mcState: "denied",
        showAntiMC: true
      }
    ];
  }

  /**
   * Subscribe to detection result updates
   * @param {function(DetectionResult): void} listener 
   * @returns {function(): void} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    // Send immediate initial state
    listener(this.getLatestResult());
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of payload change
   */
  notify() {
    const payload = this.getLatestResult();
    this.listeners.forEach(cb => cb(payload));
  }

  /**
   * Switch deterministic scenario
   */
  setScenario(scenarioKey) {
    if (this.scenarios[scenarioKey]) {
      this.activeScenarioKey = scenarioKey;
      this.restart();
    }
  }

  /**
   * Start state machine simulation
   */
  start() {
    this.stop();
    this.currentStepIndex = 0;
    this.notify();
    this.scheduleNextStep();
  }

  scheduleNextStep() {
    const currentStep = this.timeline[this.currentStepIndex];
    if (currentStep && currentStep.delay > 0) {
      this.timerId = setTimeout(() => {
        if (this.currentStepIndex < this.timeline.length - 1) {
          this.currentStepIndex++;
          this.notify();
          this.scheduleNextStep();
        }
      }, currentStep.delay);
    }
  }

  /**
   * Stop timer
   */
  stop() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Restart sequence
   */
  restart() {
    this.start();
  }

  /**
   * Get current DetectionResult matching contract
   * @returns {DetectionResult}
   */
  getLatestResult() {
    const scenario = this.scenarios[this.activeScenarioKey];
    const currentStep = this.timeline[this.currentStepIndex];

    const activeDetections = [];

    // Filter detections based on state machine step
    scenario.detections.forEach(det => {
      if (det.role === 'main_character' && currentStep.showMC) {
        activeDetections.push({
          ...det,
          statusState: currentStep.mcState || 'active'
        });
      } else if (det.role === 'anti_main_character' && currentStep.showAntiMC) {
        activeDetections.push({
          ...det,
          statusState: 'focused'
        });
      }
    });

    return {
      detections: activeDetections,
      main_character: currentStep.showMC ? scenario.main_character_id : null,
      anti_main_character: currentStep.showAntiMC ? scenario.anti_main_character_id : null,
      state: currentStep.step,
      headline: currentStep.headline,
      subline: currentStep.subline,
      scenarioName: scenario.name,
      antiLabel: scenario.anti_label,
      antiImportance: scenario.anti_importance
    };
  }
}
