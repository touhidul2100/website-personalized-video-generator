import puppeteer from "puppeteer";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

const { TAB_NAME, GOOGLE_CREDENTIALS, SHEET_URL } = process.env;

// Function to initialize Google Sheets API client
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  return sheets;
}

// Function to extract Spreadsheet ID from URL
function getSpreadsheetId(url) {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet URL");
  return match[1];
}

async function withRetry(operation, maxRetries, retryDelay) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      attempts++;
      return await operation();
    } catch (error) {
      if (attempts < maxRetries) {
        console.warn(
          `Operation failed. Retrying... (${attempts}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.error("Operation failed after maximum retries.");
        throw error;
      }
    }
  }
}

// Function to get sheet data
// async function getSheetData(sheets, spreadsheetId, range) {
//   const res = await sheets.spreadsheets.values.get({
//     spreadsheetId,
//     range,
//   });
//   return res.data.values;
// }
async function getSheetData(
  sheets,
  spreadsheetId,
  range,
  maxRetries = 500,
  retryDelay = 30000
) {
  return await withRetry(
    async () => {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      return res.data.values;
    },
    maxRetries,
    retryDelay
  );
}

// Function to update sheet data
// async function updateSheetData(sheets, spreadsheetId, range, values) {
//   await sheets.spreadsheets.values.update({
//     spreadsheetId,
//     range,
//     valueInputOption: 'RAW',
//     resource: {
//       values,
//     },
//   });
// }
async function updateSheetData(
  sheets,
  spreadsheetId,
  range,
  values,
  maxRetries = 500,
  retryDelay = 30000
) {
  await withRetry(
    async () => {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: {
          values,
        },
      });
    },
    maxRetries,
    retryDelay
  );
}

// Function to append a new column if it doesn't exist
async function ensureColumnExists(
  sheets,
  spreadsheetId,
  sheetData,
  columnName
) {
  const headers = sheetData[0];
  if (!headers.includes(columnName)) {
    headers.push(columnName);
    await updateSheetData(sheets, spreadsheetId, `${TAB_NAME}!1:${1}`, [
      headers,
    ]);
    console.log(`Added column "${columnName}" to the sheet.`);
    return headers;
  }
  return headers;
}

// Function to get the total row count
function getRowCount(sheetData) {
  return sheetData.length - 1; // Exclude header
}

// Function to get processed entries based on "Personal Loom URL"
function getProcessedEntries(sheetData, headers) {
  const processed = new Set();
  const websiteUrlIndex = headers.indexOf("Website URL");
  const loomUrlIndex = headers.indexOf("Personal Loom URL");

  if (websiteUrlIndex === -1 || loomUrlIndex === -1) {
    console.error("Required columns are missing.");
    return processed;
  }

  sheetData.slice(1).forEach((row) => {
    const websiteUrl = row[websiteUrlIndex];
    const loomUrl = row[loomUrlIndex];
    if (websiteUrl && loomUrl) {
      processed.add(websiteUrl.trim());
    }
  });
  return processed;
}

// Helper function to get column index by name
function getColumnIndex(headers, columnName) {
  return headers.indexOf(columnName);
}

// Function to read a batch of rows to process
function readSheetBatch(sheetData, processedEntries, batchSize, headers) {
  const batch = [];
  const websiteUrlIndex = getColumnIndex(headers, "Website URL");
  const personalVideoIndex = getColumnIndex(headers, "Personal Video");

  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const websiteUrl = row[websiteUrlIndex];
    const personalVideo = row[personalVideoIndex];

    if (!processedEntries.has(websiteUrl?.trim()) && personalVideo?.trim()) {
      batch.push({ rowNumber: i + 1, rowData: row });
      if (batch.length >= batchSize) break;
    }
  }

  return batch;
}

// Function to update "Personal Loom URL" in the sheet
// async function updatePersonalLoomUrl(sheets, spreadsheetId, rowNumber, columnIndex, loomUrl) {
//   const columnLetter = getColumnLetter(columnIndex + 1);
//   const A1Notation = `${TAB_NAME}!${columnLetter}${rowNumber}`;
//   await sheets.spreadsheets.values.update({
//     spreadsheetId,
//     range: A1Notation,
//     valueInputOption: 'RAW',
//     resource: {
//       values: [[loomUrl]],    },
//   });
// }
async function updatePersonalLoomUrl(
  sheets,
  spreadsheetId,
  rowNumber,
  columnIndex,
  loomUrl,
  maxRetries = 500,
  retryDelay = 30000
) {
  const columnLetter = getColumnLetter(columnIndex + 1);
  const A1Notation = `${TAB_NAME}!${columnLetter}${rowNumber}`;

  await withRetry(
    async () => {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: A1Notation,
        valueInputOption: "RAW",
        resource: {
          values: [[loomUrl]],
        },
      });
    },
    maxRetries,
    retryDelay
  );
}

// Helper function to convert column index to letter
function getColumnLetter(col) {
  let letter = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}

// Function to upload video to Loom
async function uploadVideo(videoPath, cookies) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.setCookie(...cookies);
    await page.goto("https://www.loom.com/looms/videos", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    const newVideoButton = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent.trim() === "New video"
      )
    );
    await newVideoButton.click();
    await page.waitForSelector("text=Upload a video", { visible: true });
    await page.click("text=Upload a video");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found");
    await fileInput.uploadFile(videoPath);
    await page.evaluate(() => {
      const uploadButton = Array.from(document.querySelectorAll("button")).find(
        (btn) => btn.textContent.trim() === "Upload 1 file"
      );
      if (uploadButton) uploadButton.click();
    });

    const maxRetries = 1800;
    const retryInterval = 1000;
    let newTab = null;

    for (let i = 0; i < maxRetries; i++) {
      const allPages = await browser.pages();
      const validTabs = allPages.filter(
        (tab) =>
          tab.url() !== "https://www.loom.com/looms/videos" &&
          tab.url() !== "about:blank"
      );
      if (validTabs.length > 0) {
        newTab = validTabs[0];
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }

    if (newTab) {
      await newTab.bringToFront();
      const videoLink = newTab.url();
      await newTab.close();
      return videoLink;
    } else {
      return "Error";
    }
  } catch (error) {
    return "Error";
  } finally {
    await browser.close();
  }
}

// Function to retry video uploads
async function uploadVideoWithRetry(videoPath, cookies) {
  const maxRetries = 3;
  const retryDelay = 5000;
  let attemptupload = 0;

  while (attemptupload < maxRetries) {
    try {
      attemptupload++;
      const result = await uploadVideo(videoPath, cookies);
      if (result !== "Error") {
        return result;
      }
    } catch (error) {}
    if (attemptupload < maxRetries) {
      console.log(
        `Retrying upload for ${videoPath} (attemptupload ${attemptupload}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return "Error";
}

// Main Script
(async () => {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = getSpreadsheetId(SHEET_URL);
    const range = `${TAB_NAME}!A:Z`; // Adjust range as needed

    let sheetData = await getSheetData(sheets, spreadsheetId, range);
    if (!sheetData || sheetData.length === 0) {
      console.error("No data found in the sheet.");
      process.exit(1);
    }

    // Ensure "Personal Loom URL" column exists
    const headers = await ensureColumnExists(
      sheets,
      spreadsheetId,
      sheetData,
      "Personal Loom URL"
    );

    // Precompute column indexes
    const personalVideoIndex = getColumnIndex(headers, "Personal Video");
    const personalLoomUrlIndex = getColumnIndex(headers, "Personal Loom URL");
    const websiteUrlIndex = getColumnIndex(headers, "Website URL");
    const CompanyNameINdex = getColumnIndex(headers, "Company Name");
    const FirstNameIndex = getColumnIndex(headers, "First Name");

    if (FirstNameIndex === -1) {
      console.error("First Name column not found.");
      process.exit(1);
    }
    if (CompanyNameINdex === -1) {
      console.error("Company Name column not found.");
      process.exit(1);
    }
    if (personalVideoIndex === -1) {
      console.error("Personal Video column not found.");
      process.exit(1);
    }

    if (personalLoomUrlIndex === -1) {
      console.error("Personal Loom URL column not found.");
      process.exit(1);
    }

    if (websiteUrlIndex === -1) {
      console.error("Website URL column not found.");
      process.exit(1);
    }

    // Reload sheet data after ensuring the column exists
    sheetData = await getSheetData(sheets, spreadsheetId, range);

    const totalRows = getRowCount(sheetData);
    console.log(`Total rows in sheet (excluding header): ${totalRows}`);

    const batchSize = 1;

    const cookiesFilePath = "./loom_cookies.json";
    if (!fs.existsSync(cookiesFilePath)) {
      console.error(`Cookies file not found at path: ${cookiesFilePath}`);
      process.exit(1);
    }
    const cookies = JSON.parse(
      await fsPromises.readFile(cookiesFilePath, "utf-8")
    );

    while (true) {
      // Refresh sheet data
      sheetData = await getSheetData(sheets, spreadsheetId, range);
      if (!sheetData || sheetData.length === 0) {
        console.error("No data found in the sheet.");
        process.exit(1);
      }

      const headers = sheetData[0];
      const processedEntries = getProcessedEntries(sheetData, headers);

      if (processedEntries.size >= totalRows) {
        console.log("All rows processed. Exiting...");
        break;
      }

      const batch = readSheetBatch(
        sheetData,
        processedEntries,
        batchSize,
        headers
      );

      if (batch.length === 0) {
        console.log("No new rows found. Waiting for updates...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`Processing batch of ${batch.length} rows...`);

      // Process the batch concurrently
      await Promise.all(
        batch.map(async (item) => {
          const { rowNumber, rowData } = item;
          const personalVideo = rowData[personalVideoIndex];
          const websiteUrl = rowData[websiteUrlIndex];
          const CompanyName = rowData[CompanyNameINdex];
          const FirstName = rowData[FirstNameIndex];



          if (personalVideo?.trim()) {
            const videoPath = personalVideo.trim();
            if (!fs.existsSync(videoPath)) {
              console.error(`File not found: ${videoPath} for row ${rowNumber}`);
              await updatePersonalLoomUrl(
                sheets,
                spreadsheetId,
                rowNumber,
                personalLoomUrlIndex,
                "Error"
              );
              return;
            }
          
            try {
              // Sanitize the website name for safe filename usage
              const sanitizedCompanyName = CompanyName
                .trim()
                .replace(/[^a-zA-Z0-9\s]/g, ""); // Remove invalid characters
              const sanitizedFirstName = FirstName.trim().replace(/[^a-zA-Z0-9\s]/g, "");

              // Construct new video name
              const videoDirectory = path.dirname(videoPath);
              const videoExtension = path.extname(videoPath);
              //if no first name
              // const newVideoName = `Personal Video for ${sanitizedFirstName} (${sanitizedCompanyName})${videoExtension}`;
               //if no first name
              const newVideoName = `Personal Video for ${sanitizedCompanyName}${videoExtension}`;
              const newVideoPath = path.join(videoDirectory, newVideoName);
          
              // Rename the video file
              await fsPromises.rename(videoPath, newVideoPath);
              console.log(`Renamed video: ${videoPath} -> ${newVideoPath}`);
          
              // Upload the renamed video
              const loomUrl = await uploadVideoWithRetry(newVideoPath, cookies);
          
              // Update the sheet with the Loom URL
              await updatePersonalLoomUrl(
                sheets,
                spreadsheetId,
                rowNumber,
                personalLoomUrlIndex,
                loomUrl
              );
          
              // Delete the video file if upload was successful
              if (loomUrl !== "Error") {
                await fsPromises.unlink(newVideoPath);
                console.log(`Deleted personal video: ${newVideoPath}`);
              } else {
                console.error(`Failed to upload video for row ${rowNumber}.`);
              }
            } catch (error) {
              console.error(`Error processing video for row ${rowNumber}: ${error.message}`);
              await updatePersonalLoomUrl(
                sheets,
                spreadsheetId,
                rowNumber,
                personalLoomUrlIndex,
                "Error"
              );
            }
          } else if (websiteUrl?.trim() && !personalVideo?.trim()) {
            console.log(
              `Row ${rowNumber} has Website URL but no Personal Video. Waiting for video to be populated.`
            );
          
          
          // if (personalVideo?.trim()) {
          //   const videoPath = personalVideo.trim();
          //   if (fs.existsSync(videoPath)) {
          //     const sanitizedWebsiteName2 = websiteName
          //       .trim()
          //       .replace(/[^a-zA-Z0-9\s]/g, "");

          //     // Generate a new video name
          //     const videoDirectory = path.dirname(videoPath);
          //     const videoExtension = path.extname(videoPath);
          //     const newVideoName = `Personal Video for ${sanitizedWebsiteName2}${videoExtension}`;
          //     const newVideoPath = path.join(videoDirectory, newVideoName);

          //     // Rename the video file
          //     await fsPromises.rename(videoPath, newVideoPath);

          //     console.log(`Renamed video: ${videoPath} -> ${newVideoPath}`);
          //     const loomUrl = await uploadVideoWithRetry(newVideoPath, cookies);
          //     await updatePersonalLoomUrl(
          //       sheets,
          //       spreadsheetId,
          //       rowNumber,
          //       personalLoomUrlIndex,
          //       loomUrl
          //     );
          //     if (loomUrl !== "Error") {
          //       try {
          //         await fsPromises.unlink(newVideoPath);
          //         console.log(`Deleted personal video: ${newVideoPath}`);
          //       } catch (error) {
          //         console.error(
          //           `Error deleting personal video ${videoPath}: ${error.message}`
          //         );
          //       }
          //     } else {
          //       console.error(`Failed to upload video for row ${rowNumber}.`);
          //     }
          //   } else {
          //     await updatePersonalLoomUrl(
          //       sheets,
          //       spreadsheetId,
          //       rowNumber,
          //       personalLoomUrlIndex,
          //       "Error"
          //     );
          //     console.error(
          //       `File not found: ${videoPath} for row ${rowNumber}`
          //     );
          //   }
          // } else if (websiteUrl?.trim() && !personalVideo?.trim()) {
          //   console.log(
          //     `Row ${rowNumber} has Website URL but no Personal Video. Waiting for video to be populated.`
          //   );
            // Optionally, you can implement a notification or flagging mechanism here
          }
        })
      );

      console.log(`Processed and updated ${batch.length} rows.`);

      // Optional: Add a short delay before the next iteration to prevent rapid looping
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("Script execution completed.");
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    process.exit(1);
  }
})();














































// import puppeteer from 'puppeteer';
// import fs from 'fs';
// import { promises as fsPromises } from 'fs';
// import { google } from 'googleapis';
// import dotenv from 'dotenv';
// import path from 'path';

// // Load environment variables from .env file
// dotenv.config();

// const {
//   TAB_NAME,
//   GOOGLE_CREDENTIALS,
//   SHEET_URL
// } = process.env;

// // Function to initialize Google Sheets API client
// async function getSheetsClient() {
//   const auth = new google.auth.GoogleAuth({
//     keyFile: path.resolve(GOOGLE_CREDENTIALS),
//     scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//   });
//   const authClient = await auth.getClient();
//   const sheets = google.sheets({ version: 'v4', auth: authClient });
//   return sheets;
// }

// // Function to extract Spreadsheet ID from URL
// function getSpreadsheetId(url) {
//   const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
//   if (!match) throw new Error('Invalid Google Sheet URL');
//   return match[1];
// }

// async function withRetry(operation, maxRetries, retryDelay) {
//   let attempts = 0;
//   while (attempts < maxRetries) {
//     try {
//       attempts++;
//       return await operation();
//     } catch (error) {
//       if (attempts < maxRetries) {
//         console.warn(`Operation failed. Retrying... (${attempts}/${maxRetries})`);
//         await new Promise(resolve => setTimeout(resolve, retryDelay));
//       } else {
//         console.error('Operation failed after maximum retries.');
//         throw error;
//       }
//     }
//   }
// }



// // Function to get sheet data
// // async function getSheetData(sheets, spreadsheetId, range) {
// //   const res = await sheets.spreadsheets.values.get({
// //     spreadsheetId,
// //     range,
// //   });
// //   return res.data.values;
// // }
// async function getSheetData(sheets, spreadsheetId, range, maxRetries = 500, retryDelay = 30000) {
//   return await withRetry(async () => {
//     const res = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range,
//     });
//     return res.data.values;
//   }, maxRetries, retryDelay);
// }




// // Function to update sheet data
// // async function updateSheetData(sheets, spreadsheetId, range, values) {
// //   await sheets.spreadsheets.values.update({
// //     spreadsheetId,
// //     range,
// //     valueInputOption: 'RAW',
// //     resource: {
// //       values,
// //     },
// //   });
// // }
// async function updateSheetData(sheets, spreadsheetId, range, values, maxRetries = 500, retryDelay = 30000) {
//   await withRetry(async () => {
//     await sheets.spreadsheets.values.update({
//       spreadsheetId,
//       range,
//       valueInputOption: 'RAW',
//       resource: {
//         values,
//       },
//     });
//   }, maxRetries, retryDelay);
// }







// // Function to append a new column if it doesn't exist
// async function ensureColumnExists(sheets, spreadsheetId, sheetData, columnName) {
//   const headers = sheetData[0];
//   if (!headers.includes(columnName)) {
//     headers.push(columnName);
//     await updateSheetData(sheets, spreadsheetId, `${TAB_NAME}!1:${1}`, [headers]);
//     console.log(`Added column "${columnName}" to the sheet.`);
//     return headers;
//   }
//   return headers;
// }

// // Function to get the total row count
// function getRowCount(sheetData) {
//   return sheetData.length - 1; // Exclude header
// }

// // Function to get processed entries based on "Personal Loom URL"
// function getProcessedEntries(sheetData, headers) {
//   const processed = new Set();
//   const websiteUrlIndex = headers.indexOf('Website URL');
//   const loomUrlIndex = headers.indexOf('Personal Loom URL');

//   if (websiteUrlIndex === -1 || loomUrlIndex === -1) {
//     console.error('Required columns are missing.');
//     return processed;
//   }

//   sheetData.slice(1).forEach(row => {
//     const websiteUrl = row[websiteUrlIndex];
//     const loomUrl = row[loomUrlIndex];
//     if (websiteUrl && loomUrl) {
//       processed.add(websiteUrl.trim());
//     }
//   });
//   return processed;
// }

// // Helper function to get column index by name
// function getColumnIndex(headers, columnName) {
//   return headers.indexOf(columnName);
// }

// // Function to read a batch of rows to process
// function readSheetBatch(sheetData, processedEntries, batchSize, headers) {
//   const batch = [];
//   const websiteUrlIndex = getColumnIndex(headers, 'Website URL');
//   const personalVideoIndex = getColumnIndex(headers, 'Personal Video');

//   for (let i = 1; i < sheetData.length; i++) {
//     const row = sheetData[i];
//     const websiteUrl = row[websiteUrlIndex];
//     const personalVideo = row[personalVideoIndex];

//     if (!processedEntries.has(websiteUrl?.trim()) && personalVideo?.trim()) {
//       batch.push({ rowNumber: i + 1, rowData: row });
//       if (batch.length >= batchSize) break;
//     }
//   }

//   return batch;
// }

// // Function to update "Personal Loom URL" in the sheet
// // async function updatePersonalLoomUrl(sheets, spreadsheetId, rowNumber, columnIndex, loomUrl) {
// //   const columnLetter = getColumnLetter(columnIndex + 1);
// //   const A1Notation = `${TAB_NAME}!${columnLetter}${rowNumber}`;
// //   await sheets.spreadsheets.values.update({
// //     spreadsheetId,
// //     range: A1Notation,
// //     valueInputOption: 'RAW',
// //     resource: {
// //       values: [[loomUrl]],    },
// //   });
// // }
// async function updatePersonalLoomUrl(sheets, spreadsheetId, rowNumber, columnIndex, loomUrl, maxRetries =500, retryDelay = 30000) {
//   const columnLetter = getColumnLetter(columnIndex + 1);
//   const A1Notation = `${TAB_NAME}!${columnLetter}${rowNumber}`;

//   await withRetry(async () => {
//     await sheets.spreadsheets.values.update({
//       spreadsheetId,
//       range: A1Notation,
//       valueInputOption: 'RAW',
//       resource: {
//         values: [[loomUrl]],
//       },
//     });
//   }, maxRetries, retryDelay);
// }





// // Helper function to convert column index to letter
// function getColumnLetter(col) {
//   let letter = '';
//   while (col > 0) {
//     const mod = (col - 1) % 26;
//     letter = String.fromCharCode(65 + mod) + letter;
//     col = Math.floor((col - mod) / 26);
//   }
//   return letter;
// }

// // Function to upload video to Loom
// async function uploadVideo(videoPath, cookies) {
//   const browser = await puppeteer.launch({
//     headless:true,
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//   });

//   const page = await browser.newPage();

//   try {
//     await page.setCookie(...cookies);
//     await page.goto('https://www.loom.com/looms/videos', { waitUntil: 'networkidle2', timeout: 60000 });
//     const newVideoButton = await page.evaluateHandle(() =>
//       Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'New video')
//     );
//     await newVideoButton.click();
//     await page.waitForSelector('text=Upload a video', { visible: true });
//     await page.click('text=Upload a video');
//     const fileInput = await page.$('input[type="file"]');
//     if (!fileInput) throw new Error('File input not found');
//     await fileInput.uploadFile(videoPath);
//     await page.evaluate(() => {
//       const uploadButton = Array.from(document.querySelectorAll('button')).find(
//         (btn) => btn.textContent.trim() === 'Upload 1 file'
//       );
//       if (uploadButton) uploadButton.click();
//     });

//     const maxRetries = 180;
//     const retryInterval = 1000;
//     let newTab = null;

//     for (let i = 0; i < maxRetries; i++) {
      
//       const allPages = await browser.pages();
//       const validTabs = allPages.filter(
//         (tab) => tab.url() !== 'https://www.loom.com/looms/videos' && tab.url() !== 'about:blank'
//       );
//       if (validTabs.length > 0) {
//         newTab = validTabs[0];
//         break;
//       }
//       await new Promise(resolve => setTimeout(resolve, retryInterval));
//     }

//     if (newTab) {
//       await newTab.bringToFront();
//       const videoLink = newTab.url();
//       await newTab.close();
//       return videoLink;
//     } else {
//       return 'Error';
//     }
//   } catch (error) {
//     return 'Error';
//   } finally {
//     await browser.close();
//   }
// }

// // Function to retry video uploads
// async function uploadVideoWithRetry(videoPath, cookies) {
//   const maxRetries = 3;
//   const retryDelay = 5000;
//   let attemptupload = 0;

//   while (attemptupload < maxRetries) {
//     try {
//       attemptupload++;
//       const result = await uploadVideo(videoPath, cookies);
//       if (result !== 'Error') {
//         return result;
//       }
//     } catch (error) {}
//     if (attemptupload < maxRetries) {
//       console.log(`Retrying upload for ${videoPath} (attemptupload ${attemptupload}/${maxRetries})...`);
//       await new Promise(resolve => setTimeout(resolve, retryDelay));
//     }
//   }
//   return 'Error';
// }

// // Main Script
// (async () => {
//   try {
//     const sheets = await getSheetsClient();
//     const spreadsheetId = getSpreadsheetId(SHEET_URL);
//     const range = `${TAB_NAME}!A:Z`; // Adjust range as needed

//     let sheetData = await getSheetData(sheets, spreadsheetId, range);
//     if (!sheetData || sheetData.length === 0) {
//       console.error('No data found in the sheet.');
//       process.exit(1);
//     }

//     // Ensure "Personal Loom URL" column exists
//     const headers = await ensureColumnExists(sheets, spreadsheetId, sheetData, 'Personal Loom URL');

//     // Precompute column indexes
//     const personalVideoIndex = getColumnIndex(headers, 'Personal Video');
//     const personalLoomUrlIndex = getColumnIndex(headers, 'Personal Loom URL');
//     const websiteUrlIndex = getColumnIndex(headers, 'Website URL');

//     if (personalVideoIndex === -1) {
//       console.error('Personal Video column not found.');
//       process.exit(1);
//     }

//     if (personalLoomUrlIndex === -1) {
//       console.error('Personal Loom URL column not found.');
//       process.exit(1);
//     }

//     if (websiteUrlIndex === -1) {
//       console.error('Website URL column not found.');
//       process.exit(1);
//     }

//     // Reload sheet data after ensuring the column exists
//     sheetData = await getSheetData(sheets, spreadsheetId, range);

//     const totalRows = getRowCount(sheetData);
//     console.log(`Total rows in sheet (excluding header): ${totalRows}`);

//     const batchSize = 3;

//     const cookiesFilePath = './loom_cookies.json';
//     if (!fs.existsSync(cookiesFilePath)) {
//       console.error(`Cookies file not found at path: ${cookiesFilePath}`);
//       process.exit(1);
//     }
//     const cookies = JSON.parse(await fsPromises.readFile(cookiesFilePath, 'utf-8'));

//     while (true) {
//       // Refresh sheet data
//       sheetData = await getSheetData(sheets, spreadsheetId, range);
//       if (!sheetData || sheetData.length === 0) {
//         console.error('No data found in the sheet.');
//         process.exit(1);
//       }

//       const headers = sheetData[0];
//       const processedEntries = getProcessedEntries(sheetData, headers);

//       if (processedEntries.size >= totalRows) {
//         console.log('All rows processed. Exiting...');
//         break;
//       }

//       const batch = readSheetBatch(sheetData, processedEntries, batchSize, headers);

//       if (batch.length === 0) {
//         console.log('No new rows found. Waiting for updates...');
//         await new Promise(resolve => setTimeout(resolve, 5000));
//         continue;
//       }

//       console.log(`Processing batch of ${batch.length} rows...`);

//       // Process the batch concurrently 
//       await Promise.all(
//         batch.map(async (item) => {
//           const { rowNumber, rowData } = item;
//           const personalVideo = rowData[personalVideoIndex];
//           const websiteUrl = rowData[websiteUrlIndex];

//           if (personalVideo?.trim()) {
//             const videoPath = personalVideo.trim();
//             if (fs.existsSync(videoPath)) {
//               const loomUrl = await uploadVideoWithRetry(videoPath, cookies);
//               await updatePersonalLoomUrl(sheets, spreadsheetId, rowNumber, personalLoomUrlIndex, loomUrl);
//               if (loomUrl !== 'Error') {
//                 try {
//                   await fsPromises.unlink(videoPath);
//                   console.log(`Deleted personal video: ${videoPath}`);
//                 } catch (error) {
//                   console.error(`Error deleting personal video ${videoPath}: ${error.message}`);
//                 }
//               } else {
//                 console.error(`Failed to upload video for row ${rowNumber}.`);
//               }
//             } else {
//               await updatePersonalLoomUrl(sheets, spreadsheetId, rowNumber, personalLoomUrlIndex, 'Error');
//               console.error(`File not found: ${videoPath} for row ${rowNumber}`);
//             }
//           } else if (websiteUrl?.trim() && !personalVideo?.trim()) {
//             console.log(`Row ${rowNumber} has Website URL but no Personal Video. Waiting for video to be populated.`);
//             // Optionally, you can implement a notification or flagging mechanism here
//           }
//         })
//       );

//       console.log(`Processed and updated ${batch.length} rows.`);

//       // Optional: Add a short delay before the next iteration to prevent rapid looping
//       await new Promise(resolve => setTimeout(resolve, 2000));
//     }

//     console.log('Script execution completed.');
//   } catch (error) {
//     console.error(`An error occurred: ${error.message}`);
//     process.exit(1);
//   }
// })();






