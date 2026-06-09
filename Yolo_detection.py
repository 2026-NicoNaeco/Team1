import cv2
from ultralytics import YOLO

model = YOLO("yolov8s.pt")

image = cv2.imread("crowd2.png")

results = model(image, conf=0.05, imgsz=2560)[0]

people = 0

for box in results.boxes:
    cls = int(box.cls[0])

    if cls == 0:  # person
        people += 1

        # 좌표
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        # 박스 그리기 (초록색)
        cv2.rectangle(image, (x1, y1), (x2, y2), (0,255,0), 2)

        # confidence 표시
        conf = float(box.conf[0])
        cv2.putText(image, f"{conf:.2f}", (x1, y1-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)

print("Detected people:", people)

cv2.imshow("YOLO Detection Debug", image)
cv2.waitKey(0)
cv2.destroyAllWindows()