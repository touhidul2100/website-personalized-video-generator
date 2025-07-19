


import os
import random
import asyncio
import numpy as np
import logging
import shutil
import subprocess
from pathlib import Path
import cv2
from dotenv import load_dotenv
from PIL import Image
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# Constants
FPS = 30
SCROLL_STEP = 15
OUTPUT_DIR = Path("personal_videos")
CONCAT_DIR = Path("concat")
FRAMES_DIR = Path("frames")
BASE_VIDEO_ENCODED_PATH = "base.mp4"
NEED_TO_OVERLAY_VIDEO_PATH = "NeedTextOverlay.mp4"
LAST_EXPLANATION_VIDEO_PATH = "last_explanation.mp4"
MASK_IMAGE_ENCODED_PATH = "mask.png"
EXPLANATION_ENCODED_PATH = "explanation_encoded.mp4"
first_path="basefornowebiste.mp4"
BATCH_SIZE = 3  # Read/process 4 rows at a time (customize as needed)
START_DATA_ROW = 2  # Data starts at row 2 if row 1 is your header
POLL_INTERVAL = 30  # Seconds to wait before rechecking 'Screenshot' cell
MAX_POLL_RETRIES = 100  # Maximum number of retries to wait for 'Screenshot'
maxretries=500
try:
    result = subprocess.run(["python", "generate_mask.py"], capture_output=True, text=True, check=True)
    print("generate_mask.py output:", result.stdout)
    print("generate_mask.py error (if any):", result.stderr)
except subprocess.CalledProcessError as e:
    print(f"generate_mask.py failed with return code {e.returncode}")
    print(f"Error output: {e.stderr}")
    raise

# Load Environment Variables
load_dotenv(dotenv_path="./.env")
SHEET_URL = os.getenv("SHEET_URL")      # e.g., "https://docs.google.com/spreadsheets/d/.../edit#gid=0"
TAB_NAME = os.getenv("TAB_NAME")        # e.g., "Sheet1"
CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS")  # e.g., "service_account.json"

# Logging Setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
mask_height = os.getenv("MASK_HEIGHT")  # returns a string, e.g. "700"
mask_width = os.getenv("MASK_WIDTH")    # returns a string, e.g. "393"
mask_left = os.getenv("MASK_LEFT")      # returns a string, e.g. "10"
mask_bottom = os.getenv("MASK_BOTTOM")  # returns a string, e.g. "10"
# Ensure necessary directories exist
for folder in [OUTPUT_DIR, FRAMES_DIR,CONCAT_DIR]:
    folder.mkdir(parents=True, exist_ok=True)



def get_google_sheet():
    """
    Returns a gspread worksheet object for the specified TAB_NAME in the .env config.
    """
    scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_PATH, scope)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_url(SHEET_URL)
    worksheet = spreadsheet.worksheet(TAB_NAME)
    return worksheet

def ensure_directory_exists(path):
    path.mkdir(parents=True, exist_ok=True)

def sanitize_filename(url):
    return "".join(c if c.isalnum() else "_" for c in url)


async def create_overlay_and_merge_videos(text_overlay_path, output_path,website_url,company_name):

        # Step 3: Command to create text overlay video
        # Absolute font file path (escaped backslashes)
    font_path = r"Roboto-Regular.ttf"

        # Define dynamic text overlays
    texts = [
        (company_name, "black", 0, 15, "740", "842"),  # Example text
    ]

    # Build the drawtext filter
    drawtext_filters = []
    for text, color, start, end, x, y in texts:
        drawtext_filters.append(
            f"drawtext=text='{text}':fontsize=48:fontcolor={color}:fontfile={font_path}:x={x}:y={y}:enable='between(t,{start},{end})'"
        )

    # Combine all filters into a single filter_complex
    filter_complex = f"[0:v]scale=1920:1080,format=yuv420p," + ",".join(drawtext_filters)

    # FFmpeg command
    textoverlay_command = [
        "ffmpeg",
        "-y",  # Overwrite output without prompting
        "-i",NEED_TO_OVERLAY_VIDEO_PATH,  # Input video file
        "-filter_complex", filter_complex,  # Apply scaling, formatting, and text overlay
        "-c:v", "libx264",  # Use H.264 codec for video encoding
        "-preset", "slow",  # High-quality compression preset
        "-crf", "16",  # High video quality (lower CRF = better quality)
        "-c:a", "aac",  # Audio codec
        "-b:a", "320k",  # High-quality audio bitrate
        "-ar", "48000",  # Audio sample rate
        "-shortest",  # Stop when the shortest stream ends
        "-r", "30",  # Set frame rate to 30 FPS
        "-threads", "0",  # Use all available CPU threads
        str(text_overlay_path),  # Output file
    ]

    # Run FFmpeg command
    try:
        print("Processing video with text overlays...")
        print("FFmpeg Command:", " ".join( textoverlay_command))  # Debugging
        subprocess.run( textoverlay_command, check=True)
        print(f"Processed video saved at: {text_overlay_path}")
        concat_list = f"{sanitize_filename(website_url)}.txt"
        with open(concat_list, "w") as file:
            file.write(f"file '{first_path}'\n")
            file.write(f"file '{text_overlay_path}'\n")
            file.write(f"file '{LAST_EXPLANATION_VIDEO_PATH}'\n")
        
        # Step 4: Command to concatenate videos
        merge_command = [
            "ffmpeg",
            "-f", "concat",  # Use the concat demuxer
            "-safe", "0",  # Allow unsafe file paths
            "-i", str(concat_list),  # Input list file
            "-c", "copy",  # Copy streams without re-encoding
            str(output_path),  # Final merged video output
        ]

        # Step 5: Run video merging
        try:
            await asyncio.to_thread(subprocess.run, merge_command, check=True)
            logging.info(f"Merged video created: {output_path}")

        except subprocess.CalledProcessError as e:
            logging.error(f"FFmpeg concating failed: {e}")
            raise
        
    except subprocess.CalledProcessError as e:
        logging.error(f"FFmpeg text overlay creation failed: {e}")
        raise
    finally:
        # Cleanup
        if text_overlay_path.exists():
            text_overlay_path.unlink()
        if Path(concat_list).exists():
            Path(concat_list).unlink()
   
            
            
            
            
async def update_google_sheet_cell(worksheet, cell, value):
    """
    Updates a single cell in the sheet with retries on network errors.
    """
    for attempt in range(maxretries):
        try:
            worksheet.update_acell(cell, value)
            logging.info(f"Updated {cell} with value: {value}")
            return
        except Exception as e:
            if attempt < maxretries-1:
                wait_time = 30
                logging.warning(f"Failed to update {cell}: {e}. Retrying in {wait_time} seconds... (Attempt {attempt + 1})")
                await asyncio.sleep(wait_time)
            else:
                logging.error(f"Max retries reached. Unable to update {cell}. Error: {e}")
                raise
       







async def process_row(global_row_idx, row_data, headers, worksheet):
    """
    Generate a personal video for a single row.
    Poll until 'Screenshot' cell is populated if initially empty.
    Always return (row_number_in_sheet, video_path or 'Error').
    """
    for attempt in range(maxretries):
        try:
            website_index = headers.index("Website URL")
            companyname_index = headers.index("Company Name")
            # Retrieve values from the row_data list if indexes are in range
            website_url = row_data[website_index].strip() if website_index < len(row_data) else ""
          
            company_name = row_data[companyname_index].strip() if companyname_index < len(row_data) else ""

            row_number_in_sheet = global_row_idx + 2  # +2 because data starts at row 2 in the sheet

            # --- Polling logic: wait until 'Screenshot' cell is non-empty ---

            # Now screenshot_path should be populated
            text_overlay_path = OUTPUT_DIR / f"{sanitize_filename(website_url)}_text.mp4"
            video_path = OUTPUT_DIR / f"{sanitize_filename(website_url)}.mp4"
            frames_subdir = FRAMES_DIR / f"{sanitize_filename(website_url)}"


            try:
               

                # Create the overlay video
                logging.info(f"Row {row_number_in_sheet}: Creating video for {website_url}")
                # await create_and_overlay_video(frames_subdir, video_path)
                await create_overlay_and_merge_videos(text_overlay_path,video_path,website_url,company_name)
                
                logging.info(f"SUCCCCCCCCCCCCCCCCRow {row_number_in_sheet}: Video created successfully for {website_url}")
                return (row_number_in_sheet, str(video_path))
                
            except Exception as e:
                logging.error(f"Row {row_number_in_sheet}:BBBBBBBBBBBBBBBBBB Error processing website '{website_url}': {e}")
                return (row_number_in_sheet, "Error")
            finally:
                # Cleanup
                if Path(frames_subdir).exists():
                    shutil.rmtree(frames_subdir, ignore_errors=True)
                    logging.info(f"Row {row_number_in_sheet}: Cleaned up frames directory for {website_url}")
                if text_overlay_path.exists():
                    text_overlay_path.unlink()
                
                    
        except Exception as e:
            if attempt < maxretries-1:
                wait_time = 30
                logging.warning(f"Failed to connect to Google Sheets. Retrying in {wait_time} seconds... (Attempt {attempt + 1})")
                asyncio.sleep(wait_time)
            else:
                logging.error("Max retries reached. Unable to connect to Google Sheets.")
                raise           


def column_index_to_letter(idx_zero_based):
    """
    Converts a zero-based column index into an Excel-style column letter.
    0 -> A, 1 -> B, 2 -> C, 25->Z, 26->AA, etc.
    """
    result = ""
    current = idx_zero_based + 1  # convert to 1-based
    while current > 0:
        remainder = (current - 1) % 26
        result = chr(65 + remainder) + result
        current = (current - 1) // 26
    return result

def ensure_personal_video_column(worksheet):
    """
    Ensures there's a column named 'Personal Video'.
    1) If it exists, do nothing.
    2) If it doesn't, place it in the first empty header cell from the left.
    3) If no empty header cells, append at the end.
    4) If col_count > len(header), shrink the sheet to match actual used columns first.
    Returns (headers, personal_video_index).
       - headers: updated list of header row values
       - personal_video_index: zero-based index of 'Personal Video' column
    """
    headers = worksheet.row_values(1)
    used_cols = len(headers)  # How many columns have some header value

    # The sheet's official col_count might be larger than used_cols
    current_col_count = worksheet.col_count
    if current_col_count > used_cols:
        logging.info(f"Shrinking sheet from {current_col_count} columns to {used_cols} to discard empty columns.")
        worksheet.resize(cols=used_cols)
        current_col_count = used_cols
        headers = worksheet.row_values(1)  # Re-read headers after resizing

    try:
        personal_video_index = headers.index("Personal Video")
        logging.info("'Personal Video' column already exists.")
        return headers, personal_video_index
    except ValueError:
        # Search for the first empty header cell from the left
        empty_col_idx = None
        for idx, header_value in enumerate(headers):
            if not header_value.strip():
                empty_col_idx = idx
                break

        if empty_col_idx is not None:
            # Insert 'Personal Video' into the first empty column
            col_to_write = empty_col_idx + 1  # Convert zero-based to 1-based
            worksheet.update_cell(1, col_to_write, "Personal Video")
            logging.info(f"Inserted 'Personal Video' into the first empty column at column #{col_to_write}")
        else:
            # Append at the end
            new_col_index = current_col_count + 1
            worksheet.resize(cols=new_col_index)
            worksheet.update_cell(1, new_col_index, "Personal Video")
            logging.info(f"Appended 'Personal Video' at the end, new column #{new_col_index}")

        # Re-read headers after insertion
        headers = worksheet.row_values(1)
        personal_video_index = headers.index("Personal Video")
        return headers, personal_video_index
    
async def main():
    worksheet = get_google_sheet()

    # Ensure 'Personal Video' column exists
    headers, personal_video_index = ensure_personal_video_column(worksheet)

    # Get all rows
    all_values = worksheet.get_all_values()
    total_rows = len(all_values) - 1  # excluding the header row
    logging.info(f"Total data rows found: {total_rows}")

    start_row = binary_search_first_empty(all_values, START_DATA_ROW, total_rows, personal_video_index)
    
    if start_row is None:
        logging.info("No unprocessed rows found. All rows are already processed.")
        return

    logging.info(f"Starting processing at row: {start_row + 1}")  # Adjust for 1-based indexing

    # Process rows starting from the found start_row
    for row_number in range(start_row + 1, total_rows + 1):  # 1-based indexing
        row_data = all_values[row_number]
        logging.info(f"Processing row: {row_number}")
        # Add your row processing logic here


def binary_search_first_empty(all_values, start, end, col_index):
    """
    Perform binary search to find the first empty row in the 'Personal Video' column.
    """
    result = None

    while start <= end:
        mid = (start + end) // 2
        row_data = all_values[mid]

        # Check if the current row's "Personal Video" column is empty
        is_empty = len(row_data) <= col_index or not row_data[col_index].strip()

        if is_empty:
            # Possible candidate found, continue to the left half
            result = mid
            end = mid - 1
        else:
            # Move to the right half
            start = mid + 1

    return result


async def main():
    worksheet = get_google_sheet()
    # Ensure 'Personal Video' column exists
    headers, personal_video_index = ensure_personal_video_column(worksheet)

    # Determine total number of data rows (excluding header)
    all_values = worksheet.get_all_values()
    total_rows = len(all_values) - 1  # excluding header row
    logging.info(f"Total data rows found: {total_rows}")
    
     # Update START_DATA_ROW to the first row with an empty 'Personal Video' column
    global START_DATA_ROW
    START_DATA_ROW = binary_search_first_empty(all_values, START_DATA_ROW, total_rows, personal_video_index)

    if START_DATA_ROW is None:
        logging.info("No unprocessed rows found. All rows are already processed.")
    else:
        logging.info(f"Updated START_DATA_ROW to: {START_DATA_ROW + 1}")  # Adjust for 1-based indexing

    start_row = START_DATA_ROW  # e.g., row 2
    while True:
        end_row = start_row + BATCH_SIZE - 1
        range_str = f"A{start_row}:Z{end_row}"  # Adjust columns to match your sheet
        logging.info(f"Reading batch rows {start_row} to {end_row}")
        batch_data = worksheet.get_values(range_str)
        if not batch_data:
            logging.info("No more data to process. Exiting.")
            break

        tasks = []
        row_number_mapping = []  # To keep track of row numbers for tasks
        for row_idx_in_batch, row_data in enumerate(batch_data):
            global_row_idx = (start_row - 2) + row_idx_in_batch  # 0-based index for entire data
            row_number_in_sheet = global_row_idx + 2  # +2 because data starts at row 2

            if not any(cell.strip() for cell in row_data):
                logging.info(f"Skipping empty row at {row_number_in_sheet}")
                continue

            # Check if 'Personal Video' is already set
            personal_video_value = ""
            if personal_video_index < len(row_data):
                personal_video_value = row_data[personal_video_index].strip()

            if personal_video_value:
                #logging.info(f"Skipping row {row_number_in_sheet}, 'Personal Video' already set.")
                continue

            # Append the task to process this row
            tasks.append(process_row(global_row_idx, row_data, headers, worksheet))

        if tasks:
            # Execute tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Update the sheet with personal video link or 'Error'
            for result in results:
                if isinstance(result, tuple) and len(result) == 2:
                    row_number_in_sheet, value = result
                    personal_video_letter = column_index_to_letter(personal_video_index)
                    personal_video_cell = f"{personal_video_letter}{row_number_in_sheet}"

                    if value == "Error":
                        # Update the cell with 'Error'
                        await update_google_sheet_cell(worksheet, personal_video_cell, "Error")
                        logging.info(f"Row {row_number_in_sheet}: Set 'Personal Video' to 'Error'")
                    else:
                        # Update the cell with the video path
                        await update_google_sheet_cell(worksheet, personal_video_cell, value)
                        logging.info(f"Row {row_number_in_sheet}: Set 'Personal Video' to video path")
                elif isinstance(result, Exception):
                    # If the coroutine raised an exception, mark as 'Error'
                    # Note: In this implementation, exceptions should be handled within process_row,
                    # so this block might not be reached. Included for completeness.
                    logging.error(f"Unexpected exception: {result}")
                    # Optionally, you can attempt to determine the row number here if needed
                else:
                    # For any unexpected result types, mark as 'Error'
                    logging.error(f"Unexpected result type: {result}")
        else:
            logging.info(f"No tasks to process in batch rows {start_row} to {end_row}")
            
        # Rest for 2 seconds before moving to the next batch
        logging.info(f"Completed batch rows {start_row} to {end_row}. Resting for 2 seconds...")
        await asyncio.sleep(1)

        # Move to the next batch
        start_row = end_row + 1
        if (start_row - 1) > (total_rows + 1):
            logging.info("We've processed up to or beyond the last row.")
            break

if __name__ == "__main__":
    asyncio.run(main())



