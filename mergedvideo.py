# import subprocess

# # FFmpeg command to concatenate two videos with re-encoding
# command = [
#     "ffmpeg", "-i", "output1.mp4", "-i", "output2.mp4",
#     "-filter_complex", "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]",
#     "-map", "[outv]", "-map", "[outa]", "output.mp4"
# ]

# # Run the command
# subprocess.run(command)

# print("Videos merged successfully into output.mp4")
# import subprocess

# # Define paths and encoding settings
# base_video_path = "Explanation Video (Miro).mp4"  # Original base video
# encoded_base_video_path = "base_encoded2.mp4"  # Encoded base video
# fps = 30  # Set desired frame rate
# width, height = 1920, 1080  # Resolution
# crf = 28  # Compression level

# # FFmpeg command to encode the base video
# command = [
#     "ffmpeg",
#     "-y",  # Overwrite without confirmation
#     "-i", base_video_path,  # Input video
#     "-vf", f"scale={width}:{height},fps={fps}",  # Scale and set FPS
#     "-c:v", "libx264",  # Use H.264 codec
#     "-crf", str(crf),  # Set CRF for qualitypy 
#     "-preset", "veryfast",  # Encoding speed
#     "-c:a", "aac",  # Audio codec
#     "-b:a", "192k",  # Audio bitrate
#     "-movflags", "+faststart",  # Optimize for streaming
#     encoded_base_video_path  # Output video
# ]

# # Run the FFmpeg command
# try:
#     subprocess.run(command, check=True)
#     print(f"Encoded base video saved as {encoded_base_video_path}")
# except subprocess.CalledProcessError as e:
#     print(f"An error occurred during encoding: {e}")




# import subprocess

# # Re-encode the second video to match desired resolution/parameters
# command_encode_second = [
#     "ffmpeg",
#     "-i", "Generic Video.mp4",
#     # Scale to 1280x720 while preserving aspect ratio
#     "-vf", "scale=1280:720:force_original_aspect_ratio=decrease",
#     "-c:v", "libx264",  # re-encode video with H.264
#     "-c:a", "aac",      # re-encode audio with AAC
#     "Generic_fixed.mp4"
# ]

# subprocess.run(command_encode_second)

# print("Second video encoded successfully into explanation_fixed.mp4")

# import subprocess

# command_encode_second = [
#     "ffmpeg",
#     # Use Intel Quick Sync Video hardware acceleration
#     "-hwaccel", "qsv",

#     # Input file
#     "-i", "Explanation Video (Miro).mp4",

#     # Scale using the QSV scale filter
#     "-vf", "scale_qsv=1280:720",

#     # Encode video with the hardware-accelerated H.264 QSV encoder
#     "-c:v", "h264_qsv",
#     # Set your desired bitrate, e.g., 4 Mbps (adjust as needed)
#     "-b:v", "4M",

#     # Encode audio in AAC
#     "-c:a", "aac",
#     # You can set an audio bitrate if desired, e.g., 128k
#     "-b:a", "128k",

#     # Output file
#     "explanation_fixed.mp4"
# ]

# subprocess.run(command_encode_second)

# print("Second video was re-encoded quickly with Intel QSV into explanation_fixed.mp4")


# ffmpeg -i explanation_fixed.mp4 -vf scale=1280:720 explanation_resized.mp4
#ffmpeg -i "Generic Video.mp4" -vf "scale=1920:1080, hqdn3d=1.5:1.5:6:6" -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k output1.mp4
#ffmpeg -i "Explanation Video (Miro).mp4" -vf "scale=1920:1080, hqdn3d=1.5:1.5:6:6" -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k output2.mp4 

import subprocess
from pathlib import Path

concat_list = Path("concat_list.txt")
output_path = Path("merged_output.mp4")

merge_command = [
    "ffmpeg",
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", str(concat_list),
    "-c", "copy",
    str(output_path)
]

subprocess.run(merge_command, check=True)


