"""
AYN NEE ETHA — CV Debug / Diagnostic Tool

Usage:
    python test_analyze.py <image_path>              # Direct inference (no server needed)
    python test_analyze.py <image_path> --api         # Via running API server
    python test_analyze.py test_images/               # Process entire directory

Prints detailed MCE breakdown for debugging the CV pipeline.
"""
import os
import sys
import io
import time
import math
import glob
import json
import argparse

import cv2
import numpy as np
from PIL import Image


def calculate_distance(p1, p2):
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def run_direct_inference(image_path):
    """Run inference directly using OpenCV DNN — no server needed."""
    from main import net, COCO_CATEGORIES, CONFIDENCE_THRESHOLD, MIN_AREA_RATIO

    if net is None:
        print("ERROR: Model not loaded. Ensure models/ssd_mobilenet_v1_10.onnx exists.")
        sys.exit(1)

    image = Image.open(image_path).convert("RGB")
    image_rgb = np.array(image)
    img_h, img_w, _ = image_rgb.shape

    print(f"IMAGE: {os.path.basename(image_path)}")
    print(f"SIZE: {img_w} x {img_h} ({img_w * img_h:,} px)")
    print()

    # Inference
    t_start = time.perf_counter()

    img_resized = cv2.resize(image_rgb, (300, 300))
    blob = np.expand_dims(img_resized, axis=0).astype(np.uint8)
    net.setInput(blob)
    out_names = ['detection_boxes:0', 'detection_classes:0', 'detection_scores:0', 'num_detections:0']
    boxes, class_ids, scores, num_dets = net.forward(out_names)

    t_inference = time.perf_counter()

    img_center = (0.5, 0.5)
    max_distance = calculate_distance((0.0, 0.0), img_center)

    count = int(num_dets[0])
    raw_count = 0
    detections = []

    for i in range(count):
        score = float(scores[0][i])
        if score < CONFIDENCE_THRESHOLD:
            continue
        raw_count += 1

        cls_id = int(class_ids[0][i])
        label = COCO_CATEGORIES.get(cls_id, f"object_{cls_id}")

        ymin, xmin, ymax, xmax = boxes[0][i]
        xmin = max(0.0, min(1.0, float(xmin)))
        ymin = max(0.0, min(1.0, float(ymin)))
        xmax = max(0.0, min(1.0, float(xmax)))
        ymax = max(0.0, min(1.0, float(ymax)))

        w_norm = xmax - xmin
        h_norm = ymax - ymin
        if w_norm <= 0 or h_norm <= 0:
            continue

        area_ratio = w_norm * h_norm
        if area_ratio < MIN_AREA_RATIO:
            continue

        x_px = int(round(xmin * img_w))
        y_px = int(round(ymin * img_h))
        w_px = int(round(w_norm * img_w))
        h_px = int(round(h_norm * img_h))

        center_norm = (xmin + w_norm / 2.0, ymin + h_norm / 2.0)

        # MCE scoring
        person_bonus = 50 if label == "person" else 0
        size_score = min(30, int(round(area_ratio * 100)))
        dist_to_center = calculate_distance(center_norm, img_center)
        norm_dist = dist_to_center / max_distance
        center_score = max(0, int(round((1.0 - norm_dist) * 20)))
        mce_score = min(100, person_bonus + size_score + center_score)

        detections.append({
            "label": label,
            "confidence": round(score, 2),
            "bbox": [x_px, y_px, w_px, h_px],
            "normalized_bbox": [round(xmin, 3), round(ymin, 3), round(w_norm, 3), round(h_norm, 3)],
            "mce_score": mce_score,
            "person_bonus": person_bonus,
            "size_score": size_score,
            "center_score": center_score,
            "area_ratio": round(area_ratio, 4),
        })

    t_end = time.perf_counter()

    # Sort by MCE descending
    detections.sort(key=lambda x: x["mce_score"], reverse=True)

    inference_ms = (t_inference - t_start) * 1000
    total_ms = (t_end - t_start) * 1000

    print(f"INFERENCE TIME: {inference_ms:.0f}ms")
    print(f"TOTAL TIME: {total_ms:.0f}ms")
    print(f"RAW DETECTIONS (above conf): {raw_count}")
    print()

    if not detections:
        print("NO VALID DETECTIONS")
        return

    print(f"DETECTIONS ({len(detections)} valid):")
    for idx, det in enumerate(detections, 1):
        bbox_str = str(det['bbox'])
        nbbox_str = str(det['normalized_bbox'])
        print(
            f"  #{idx:<2} {det['label']:<14} "
            f"conf={det['confidence']:.2f}  "
            f"bbox={bbox_str:<24} "
            f"nbbox={nbbox_str:<28} "
            f"MCE={det['mce_score']:<3} "
            f"[person:{det['person_bonus']:<2} + size:{det['size_score']:<2} + center:{det['center_score']:<2}]  "
            f"area={det['area_ratio']:.4f}"
        )

    print()
    mc = detections[0]
    print(f"[*] MAIN CHARACTER:      {mc['label']} (MCE: {mc['mce_score']})")

    if len(detections) > 1:
        amc = detections[-1]
        print(f"[#] ANTI-MAIN CHARACTER: {amc['label']} (MCE: {amc['mce_score']})")
    else:
        print("[#] ANTI-MAIN CHARACTER: null (single detection)")


def run_api_inference(image_path):
    """Send image to running API server at localhost:8000."""
    try:
        import requests
    except ImportError:
        print("ERROR: 'requests' package needed for --api mode. Install with: pip install requests")
        sys.exit(1)

    url = "http://localhost:8000/analyze"
    print(f"IMAGE: {os.path.basename(image_path)}")
    print(f"Sending to {url}...")
    print()

    t_start = time.perf_counter()
    with open(image_path, "rb") as f:
        res = requests.post(url, files={"file": (os.path.basename(image_path), f, "image/jpeg")})
    t_end = time.perf_counter()

    print(f"STATUS: {res.status_code}")
    print(f"REQUEST TIME: {(t_end - t_start) * 1000:.0f}ms")
    print()

    if res.status_code != 200:
        print(f"ERROR: {res.text}")
        return

    data = res.json()
    print(f"IMAGE SIZE: {data['image_width']} x {data['image_height']}")
    print()

    if not data["detections"]:
        print("NO VALID DETECTIONS")
        return

    print(f"DETECTIONS ({len(data['detections'])} valid):")
    for idx, det in enumerate(data["detections"], 1):
        comp = det["mce_components"]
        print(
            f"  #{idx:<2} {det['label']:<14} "
            f"conf={det['confidence']:.2f}  "
            f"bbox={str(det['bbox']):<24} "
            f"nbbox={str(det['normalized_bbox']):<28} "
            f"MCE={det['mce_score']:<3} "
            f"[person:{comp['person_bonus']:<2} + size:{comp['size_score']:<2} + center:{comp['center_score']:<2}]"
        )

    print()
    mc = data["main_character"]
    if mc:
        print(f"[*] MAIN CHARACTER:      {mc['label']} (MCE: {mc['mce_score']})")
    amc = data["anti_main_character"]
    if amc:
        print(f"[#] ANTI-MAIN CHARACTER: {amc['label']} (MCE: {amc['mce_score']})")
    elif mc:
        print("[#] ANTI-MAIN CHARACTER: null (single detection)")


def main():
    parser = argparse.ArgumentParser(description="AYN NEE ETHA -- CV Debug Tool")
    parser.add_argument("path", help="Path to an image file or directory of images")
    parser.add_argument("--api", action="store_true", help="Use running API server instead of direct inference")
    args = parser.parse_args()

    # Collect image paths
    if os.path.isdir(args.path):
        patterns = ["*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp"]
        image_paths = []
        for pat in patterns:
            image_paths.extend(glob.glob(os.path.join(args.path, pat)))
        image_paths.sort()
    elif os.path.isfile(args.path):
        image_paths = [args.path]
    else:
        print(f"ERROR: Path not found: {args.path}")
        sys.exit(1)

    if not image_paths:
        print(f"No images found in: {args.path}")
        sys.exit(1)

    separator = "\n" + "=" * 60 + "\n"
    print()
    print("=" * 60)
    print("  AYN NEE ETHA -- CV Debug Tool")
    print("=" * 60)

    run_fn = run_api_inference if args.api else run_direct_inference

    for img_path in image_paths:
        print(separator)
        run_fn(img_path)

    print(separator)
    print(f"Processed {len(image_paths)} image(s).")


if __name__ == "__main__":
    main()
