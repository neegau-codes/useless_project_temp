import cv2
import numpy as np

net = cv2.dnn.readNetFromONNX("models/ssd_mobilenet_v1_10.onnx")

with open("models/coco-labels-2014_2017.txt") as f:
    labels = [l.strip() for l in f.readlines()]

img_path = "test_images/person_objects.jpg"
image = cv2.imread(img_path)
h, w, _ = image.shape

img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
img_resized = cv2.resize(img_rgb, (300, 300))
blob = np.expand_dims(img_resized, axis=0).astype(np.uint8)

net.setInput(blob)
out_names = ['detection_boxes:0', 'detection_classes:0', 'detection_scores:0', 'num_detections:0']
boxes, class_ids, scores, num_dets = net.forward(out_names)

print("Num Detections:", num_dets[0])
for i in range(int(num_dets[0])):
    score = scores[0][i]
    if score >= 0.40:
        cls_id = int(class_ids[0][i])
        ymin, xmin, ymax, xmax = boxes[0][i]
        label = labels[cls_id - 1] if 0 < cls_id <= len(labels) else f"class_{cls_id}"
        
        # Pixel coordinates
        left = int(xmin * w)
        top = int(ymin * h)
        right = int(xmax * w)
        bottom = int(ymax * h)
        bw = right - left
        bh = bottom - top
        
        print(f"Det #{i}: {label} (conf: {score:.2f}) -> bbox: [{left}, {top}, {bw}, {bh}]")
