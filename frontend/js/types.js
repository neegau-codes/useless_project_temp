/**
 * @typedef {Object} BoundingBox
 * @property {number} x - Left coordinate in pixels (or relative percentage)
 * @property {number} y - Top coordinate in pixels
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 */

/**
 * @typedef {Object} Detection
 * @property {string} id - Unique identifier (e.g. 'person-1', 'chair-1')
 * @property {string} label - Human readable label (e.g. 'person', 'chair')
 * @property {number} score - Confidence / Energy score (0 - 100)
 * @property {BoundingBox} bbox - Bounding box coordinates
 * @property {'main_character' | 'anti_main_character' | 'npc'} [role] - Assigned role
 */

/**
 * @typedef {Object} DetectionResult
 * @property {Detection[]} detections - List of detected objects/people
 * @property {string} [main_character] - ID of the primary main character (to avoid/blur)
 * @property {string} [anti_main_character] - ID of the selected target (to emphasize)
 * @property {string} [state] - Current state machine step label
 * @property {string} [headline] - Telemetry console primary message
 * @property {string} [subline] - Telemetry console secondary message
 */
