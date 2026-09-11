import io
import os
import math
import logging
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logger = logging.getLogger(__name__)

app = FastAPI(title="AYN NEE ETHA CV API")

# CORS — allow frontend dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configurable thresholds ---
CONFIDENCE_THRESHOLD = 0.40
MIN_AREA_RATIO = 0.001  # 0.1% of frame area

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
ONNX_PATH = os.path.join(MODEL_DIR, "ssd_mobilenet_v1_10.onnx")

net = None

if os.path.exists(ONNX_PATH):
    net = cv2.dnn.readNetFromONNX(ONNX_PATH)

# COCO 80 Category Map (1-indexed dataset category IDs)
COCO_CATEGORIES = {
    1: 'person', 2: 'bicycle', 3: 'car', 4: 'motorcycle', 5: 'airplane', 6: 'bus', 7: 'train', 8: 'truck',
    9: 'boat', 10: 'traffic light', 11: 'fire hydrant', 13: 'stop sign', 14: 'parking meter', 15: 'bench',
    16: 'bird', 17: 'cat', 18: 'dog', 19: 'horse', 20: 'sheep', 21: 'cow', 22: 'elephant', 23: 'bear',
    24: 'zebra', 25: 'giraffe', 27: 'backpack', 28: 'umbrella', 31: 'handbag', 32: 'tie', 33: 'suitcase',
    34: 'frisbee', 35: 'skis', 36: 'snowboard', 37: 'sports ball', 38: 'kite', 39: 'baseball bat',
    40: 'baseball glove', 41: 'skateboard', 42: 'surfboard', 43: 'tennis racket', 44: 'bottle', 46: 'wine glass',
    47: 'cup', 48: 'fork', 49: 'knife', 50: 'spoon', 51: 'bowl', 52: 'banana', 53: 'apple', 54: 'sandwich',
    55: 'orange', 56: 'broccoli', 57: 'carrot', 58: 'hot dog', 59: 'pizza', 60: 'donut', 61: 'cake', 62: 'chair',
    63: 'couch', 64: 'potted plant', 65: 'bed', 67: 'dining table', 70: 'toilet', 72: 'tv', 73: 'laptop',
    74: 'mouse', 75: 'remote', 76: 'keyboard', 77: 'cell phone', 78: 'microwave', 79: 'oven', 80: 'toaster',
    81: 'sink', 82: 'refrigerator', 84: 'book', 85: 'clock', 86: 'vase', 87: 'scissors', 88: 'teddy bear',
    89: 'hair drier', 90: 'toothbrush'
}

@app.get("/health")
def health_check():
    model_loaded = net is not None
    return {
        "status": "ok" if model_loaded else "error",
        "model_loaded": model_loaded,
        "engine": "OpenCV DNN (SSD MobileNet v1 ONNX)"
    }

def calculate_distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def detect_objects(image_rgb, conf_threshold=CONFIDENCE_THRESHOLD):
    img_h, img_w, _ = image_rgb.shape
    img_resized = cv2.resize(image_rgb, (300, 300))
    blob = np.expand_dims(img_resized, axis=0).astype(np.uint8)
    
    net.setInput(blob)
    out_names = ['detection_boxes:0', 'detection_classes:0', 'detection_scores:0', 'num_detections:0']
    try:
        boxes, class_ids, scores, num_dets = net.forward(out_names)
    except cv2.error as e:
        logger.warning(f"OpenCV DNN forward warning (featureless image): {e}")
        return []
    
    results = []
    count = int(num_dets[0])
    
    for i in range(count):
        score = float(scores[0][i])
        if score < conf_threshold:
            continue
            
        cls_id = int(class_ids[0][i])
        label = COCO_CATEGORIES.get(cls_id, f"object_{cls_id}")
        
        ymin, xmin, ymax, xmax = boxes[0][i]
        
        # Clamp to [0, 1] bounds
        xmin = max(0.0, min(1.0, float(xmin)))
        ymin = max(0.0, min(1.0, float(ymin)))
        xmax = max(0.0, min(1.0, float(xmax)))
        ymax = max(0.0, min(1.0, float(ymax)))
        
        w_norm = xmax - xmin
        h_norm = ymax - ymin
        
        if w_norm <= 0 or h_norm <= 0:
            continue
            
        # Pixel coordinates
        x_px = int(round(xmin * img_w))
        y_px = int(round(ymin * img_h))
        w_px = int(round(w_norm * img_w))
        h_px = int(round(h_norm * img_h))
        
        results.append({
            "label": label,
            "confidence": round(score, 2),
            "bbox_pixel": [x_px, y_px, w_px, h_px],
            "bbox_norm": [round(xmin, 3), round(ymin, 3), round(w_norm, 3), round(h_norm, 3)],
            "area_ratio": w_norm * h_norm,
            "center_norm": (xmin + w_norm / 2.0, ymin + h_norm / 2.0)
        })
        
    return results

@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    # --- Guard: model must be loaded ---
    if net is None:
        raise HTTPException(status_code=503, detail="CV model not loaded. Ensure the ONNX model is present.")

    # --- Read and validate file contents ---
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        image_rgb = np.array(image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file. Could not decode the uploaded file as an image.")

    img_h, img_w, _ = image_rgb.shape
    img_center = (0.5, 0.5)
    max_distance = calculate_distance((0.0, 0.0), img_center)

    try:
        raw_detections = detect_objects(image_rgb, conf_threshold=CONFIDENCE_THRESHOLD)
    except Exception as e:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail="Inference error during object detection.")

    detections = []

    for det in raw_detections:
        area_ratio = det["area_ratio"]

        # Filter out tiny noisy detections (< 0.1% frame area)
        if area_ratio < MIN_AREA_RATIO:
            continue

        label = det["label"]
        confidence = det["confidence"]
        pixel_bbox = det["bbox_pixel"]
        normalized_bbox = det["bbox_norm"]

        # MCE transparent scoring:
        # 1. Person bonus: 50 points if class is "person", otherwise 0
        person_bonus = 50 if label == "person" else 0

        # 2. Size score: up to 30 points (area ratio * 100, capped at 30)
        size_score = min(30, int(round(area_ratio * 100)))

        # 3. Center proximity: up to 20 points
        dist_to_center = calculate_distance(det["center_norm"], img_center)
        norm_dist = dist_to_center / max_distance
        center_score = max(0, int(round((1.0 - norm_dist) * 20)))

        mce_score = min(100, person_bonus + size_score + center_score)

        detections.append({
            "label": label,
            "confidence": confidence,
            "bbox": pixel_bbox,
            "normalized_bbox": normalized_bbox,
            "mce_score": mce_score,
            "mce_components": {
                "person_bonus": person_bonus,
                "size_score": size_score,
                "center_score": center_score
            }
        })

    # Sort detections by MCE score descending
    detections.sort(key=lambda x: x["mce_score"], reverse=True)

    main_character = None
    anti_main_character = None

    if len(detections) > 0:
        mc = detections[0]
        main_character = {
            "label": mc["label"],
            "mce_score": mc["mce_score"],
            "bbox": mc["bbox"],
            "normalized_bbox": mc["normalized_bbox"]
        }

        if len(detections) > 1:
            amc = detections[-1]
            anti_main_character = {
                "label": amc["label"],
                "mce_score": amc["mce_score"],
                "bbox": amc["bbox"],
                "normalized_bbox": amc["normalized_bbox"]
            }
        else:
            anti_main_character = None

    response = {
        "image_width": img_w,
        "image_height": img_h,
        "detections": detections,
        "main_character": main_character,
        "anti_main_character": anti_main_character
    }

    if len(detections) == 0:
        response["message"] = "No valid subjects detected in image."

    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
