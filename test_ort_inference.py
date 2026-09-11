import onnxruntime as ort
import numpy as np
import cv2

session = ort.InferenceSession("models/ssd_mobilenet_v1_10.onnx")

with open("models/coco-labels-2014_2017.txt") as f:
    labels = [l.strip() for l in f.readlines()]

img_path = "test_images/person_objects.jpg"
image = cv2.imread(img_path)
h, w, _ = image.shape

img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
img_resized = cv2.resize(img_rgb, (300, 300))
input_tensor = np.expand_dims(img_resized, axis=0).astype(np.uint8)

outputs = session.run(None, {"image_tensor:0": input_tensor})
boxes, classes, scores, num_dets = outputs

print(f"Detected {int(num_dets[0])} raw boxes:")
for i in range(int(num_dets[0])):
    score = scores[0][i]
    if score >= 0.40:
        cls_id = int(classes[0][i])
        ymin, xmin, ymax, xmax = boxes[0][i]
        label = labels[cls_id - 1] if 0 < cls_id <= len(labels) else f"class_{cls_id}"
        
        left = int(xmin * w)
        top = int(ymin * h)
        right = int(xmax * w)
        bottom = int(ymax * h)
        bw = right - left
        bh = bottom - top
        print(f"  -> {label} ({score:.2f}) bbox: [{left}, {top}, {bw}, {bh}]")
