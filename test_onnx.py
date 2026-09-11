import onnxruntime as ort
import numpy as np
import cv2
import json

session = ort.InferenceSession("models/ssd_mobilenet_v1_10.onnx")
print("Inputs:", [i.name for i in session.get_inputs()])
print("Outputs:", [o.name for o in session.get_outputs()])

with open("models/coco-labels-2014_2017.txt") as f:
    labels = [l.strip() for l in f.readlines()]
print(f"Loaded {len(labels)} labels. First 5: {labels[:5]}")
