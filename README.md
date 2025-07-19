# Website Personalized Video Generator

A fully automated system that generates personalized marketing videos from website screenshots — using AI face detection, Puppeteer, FFmpeg, OpenCV, and Google Sheets integration.

---

## 🚀 What It Does

This project automates the complete workflow of creating and delivering personalized marketing videos:

- 📸 Captures full-page website screenshots using Puppeteer
- 🧠 Detects faces using an AI model (OpenCV + DNN) to generate circular masks
- 🎞️ Creates a dynamic scroll-based video using FFmpeg overlays and branding
- ✍️ Adds personalized text like “Prepared for [Client Name]”
- 📤 Uploads the final video automatically to Loom via browser automation
- 📊 Updates a linked Google Sheet with the Loom video link
- 🧩 Calls a custom API to retrieve the Loom **embed HTML snippet**
- 🔁 Appends that embed code back into the Google Sheet — ready for use in emails, landing pages, etc.

---

## 🛠 Tech Stack

- **Node.js + Express** – For API routing and Loom automation
- **Puppeteer** – For taking screenshots and controlling Loom upload flow
- **Python + OpenCV** – For face detection and mask generation
- **FFmpeg** – For video composition and rendering
- **Google Sheets API (gspread)** – For tracking and batch processing
- **Custom API** – For fetching Loom video embed code

---

## 📁 Project Structure

FinalAutomationVideo/
├── server/ # Node.js server and upload logic
│ ├── index.js
│ ├── screenshot.js
│ └── uploadloom.js
├── video_engine/ # Python scripts for video generation
│ ├── personalvideo.py
│ ├── batch_generator.py
│ ├── generate_mask.py
├── models/ # OpenCV DNN model files
├── base.mp4 # Speaker video
├── mask.png # AI-generated mask
├── .env # Configuration file (excluded in git)
├── README.md # This file

yaml
Copy
Edit

---

## ⚙️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/touhidul2100/website-personalized-video-generator.git
cd website-personalized-video-generator
2. Install Python dependencies
bash
Copy
Edit
cd video_engine
pip install -r requirements.txt
3. Install Node.js dependencies
bash
Copy
Edit
cd ../server
npm install
4. Create .env file
env
Copy
Edit
# Loom Upload
LOOM_COOKIES=[Your Loom session cookies as JSON]

# Google Sheets
SHEET_URL=https://docs.google.com/spreadsheets/d/...
TAB_NAME=Sheet1
GOOGLE_CREDENTIALS=deviceapprovalsystem-e0bb30378920.json

# Custom Embed API
LOOM_EMBED_API=http://localhost:3000/getGifEmbed
💡 Usage
Step 1: Generate AI Face Mask (Run once)
bash
Copy
Edit
python video_engine/generate_mask.py
Step 2: Batch Process Google Sheet
bash
Copy
Edit
python video_engine/batch_generator.py
This script will:

Wait for new URLs + company names

Generate the video

Upload to Loom

Write the Loom URL back to the sheet

Call your API to get the embed HTML

Update the embed column in the sheet

🧠 Example API (Loom Embed)
http
Copy
Edit
POST /getGifEmbed
Content-Type: application/json

{
  "loomUrl": "https://www.loom.com/share/abc123..."
}
Returns:

json
Copy
Edit
{
  "gifEmbedCode": "<iframe src='...' width='...' height='...'></iframe>"
}
✅ TODO
 Frontend preview of queued/generated videos

 Retry system for embed API failures

 Support multiple base templates

 Dockerize pipeline

## 📄 License

MIT License © 2025 Touhidul Islam
