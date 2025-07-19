import os
import numpy as np
import logging
import cv2
from dotenv import load_dotenv
from pathlib import Path

# Constants
MASK_IMAGE_ENCODED_PATH = "mask.png"
MODEL_PATH = r"models/deploy.prototxt"
WEIGHTS_PATH = r"models/res10_300x300_ssd_iter_140000.caffemodel"
VIDEO_PATH = r"base.mp4"


# Load environment variables
load_dotenv(dotenv_path="./.env")

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

if Path(MASK_IMAGE_ENCODED_PATH).exists():
    try:
        Path(MASK_IMAGE_ENCODED_PATH).unlink()
        logging.info(f"deleted mask..")
    except Exception as e:
            logging.error(f"Error while deleting mask: {e}")
print("Mask generation started")
#update env file mask width and height
def update_env_value(key, value, env_file=".env"):
    """Updates or adds a key=value line in the given .env file."""
    try:
        with open(env_file, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        # If .env doesn't exist yet, start with no lines
        lines = []

    new_lines = []
    replaced = False

    for line in lines:
        if line.strip().startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            replaced = True
        else:
            new_lines.append(line)

    if not replaced:
        # If the key wasn't found, add it at the end
        new_lines.append(f"{key}={value}\n")

    with open(env_file, "w") as f:
        f.writelines(new_lines)

    
def check_or_generate_mask():
   
    try:
        # Paths to the model files
        model_path = r"models\deploy.prototxt"
        weights_path = r"models\res10_300x300_ssd_iter_140000.caffemodel"

        # Verify that the model files exist
        if not os.path.exists(model_path) or not os.path.exists(weights_path):
            logging.error("Model files not found. Please check the paths.")
            exit()

        # Path to the video file
        video_path = r"base.mp4"  # Replace with your file path or use 0 for webcam


        # Load the pre-trained DNN model for face detection
        net = cv2.dnn.readNetFromCaffe(model_path, weights_path)

        # Open the video file
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logging.error(f"Could not open video at {video_path}.")
            exit()

        # Video scaling parameters
        target_width = 700

        frame_skip = 10  # Skip every 10 frames for optimization
        frame_count = 0
        mask_saved = False

        # Process video
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        logging.info(f"Total frames in video: {total_frames}")

        while cap.isOpened() and not mask_saved:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            # Skip frames for optimization
            if frame_count % frame_skip != 0:
                continue

            # Resize frame to scale width to 500 pixels while maintaining aspect ratio
            h, w = frame.shape[:2]
            scale_factor = target_width / w
            new_w = target_width
            new_h = int(h * scale_factor)
            frame = cv2.resize(frame, (new_w, new_h))

            # Update dimensions after resizing
            h, w = frame.shape[:2]

            # Prepare the blob for DNN
            blob = cv2.dnn.blobFromImage(frame, 1.0, (300, 300), (104.0, 177.0, 123.0))
            net.setInput(blob)
            detections = net.forward()

            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence > 0.5:  # Confidence threshold
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    x, y, x2, y2 = box.astype("int")
                    face_width = x2 - x
                    face_height = y2 - y

                    # Calculate circle parameters
                    # distance_from_head_above = max(0, y - (100*new_h)//720)
                    value=130 #generally we will use 100 but for kevin video we are using 130
                    while value>=0:
                        distance_from_head_above = max(0, y - (value * new_h) // 720)
                        if distance_from_head_above != 0:
                            break
                        value -= 10
            
                    circle_center_y = (distance_from_head_above + h) // 2
                    circle_center_x = x + face_width // 2

                    radius = max(
                        (h - distance_from_head_above) // 2,
                        face_width // 2,
                        face_height // 2
                    )

                    radius = min(
                        radius,
                        circle_center_y - distance_from_head_above,
                        h - circle_center_y,
                        circle_center_x,
                        w - circle_center_x
                    )

                    circle_center = (circle_center_x, circle_center_y)

                    # Calculate distances from boundaries
                    distance_left_to_circle = circle_center_x - radius
                    distance_bottom_to_circle = h - (circle_center_y + radius)

                    # Print the distances
                    print(f"Distance from left boundary to circle boundary: {distance_left_to_circle}")
                    print(f"Distance from bottom boundary to circle boundary: {distance_bottom_to_circle}")
                    print(f"Frame dimensions: width={w}, height={h}")
                    # Usage:
                    left=distance_left_to_circle
                    if left>10:
                        left=(left-10)
                        update_env_value("MASK_LEFT", f"-{str(left)}")
                    elif left<10:
                        left=(10-left)
                        update_env_value("MASK_LEFT", f"+{str(left)}")
                    else:
                        update_env_value("MASK_LEFT", "10")  
                    bottom=distance_bottom_to_circle
                    if bottom>10:
                        bottom=(bottom-10)
                        update_env_value("MASK_BOTTOM", f"-{str(bottom)}")
                    if bottom<10:
                        bottom=10-bottom
                        update_env_value("MASK_BOTTOM", f"-{str(bottom)}")
                    else:
                        update_env_value("MASK_BOTTOM", "10")
                        
                    update_env_value("MASK_HEIGHT", str(h))
                    update_env_value("MASK_WIDTH", str(w))   
                    
                    
                    # Create a binary mask
                    mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(mask, circle_center, radius, 255, -1)
                    mask_path = os.path.join("mask.png")
                    cv2.imwrite(mask_path, mask)

                    
                    
                    logging.info(f"Circle center: {circle_center}, radius: {radius}")
                    logging.info(f"Mask saved to: {mask_path}")
                    

                    mask_saved = True
                    break

        cap.release()
        if not mask_saved:
            raise RuntimeError("Failed to generate mask.png: No face detected in the video.")
    except Exception as e:
        logging.error(f"Error while generating mask.png: {e}")
        raise

    
        
def main():
    logging.info("Starting mask generation...")
    check_or_generate_mask()
    logging.info("Mask generation completed.")


if __name__ == "__main__":
    main()