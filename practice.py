import subprocess
import os

# Paths to the videos
first_video = "E:\FinalAutomationVideo\personal_videos\http___www_pinkandnavyboutique_com.mp4"
second_video = "E:\FinalAutomationVideo\explanation_encoded.mp4"
output_video = "merged_video.mp4"

# Temporary concat list file
concat_list = "concat_list.txt"

# Create the concat list file
with open(concat_list, "w") as file:
    file.write(f"file '{first_video}'\n")
    file.write(f"file '{second_video}'\n")

# FFmpeg command to concatenate without re-encoding
command = [
    "ffmpeg",
    "-f", "concat",  # Use the concat demuxer
    "-safe", "0",  # Allow unsafe file paths
    "-i", concat_list,  # Input list file
    "-c", "copy",  # Copy streams without re-encoding
    output_video  # Output video
]

# Execute the FFmpeg command
try:
    subprocess.run(command, check=True)
    print(f"Merged video saved as {output_video}")
except subprocess.CalledProcessError as e:
    print(f"An error occurred: {e}")
finally:
    # Clean up temporary files
    if os.path.exists(concat_list):
        os.remove(concat_list)
        print(f"Temporary file {concat_list} deleted.")
