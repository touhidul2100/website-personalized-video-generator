

import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

dotenv.config();

const imagesFolder = 'images';
const batchSize = 3; // Process 5 rows per batch

// Ensure the images folder exists
if (!fs.existsSync(imagesFolder)) {
  fs.mkdirSync(imagesFolder);
}

// Extract Spreadsheet ID from Sheet URL
function extractSpreadsheetId(sheetUrl) {
  const match = sheetUrl.match(/\/d\/(.+?)\//);
  if (match) return match[1];
  throw new Error('Invalid Google Sheet URL');
}

const spreadsheetId = extractSpreadsheetId(process.env.SHEET_URL);

// Google Sheets Integration
const googleAuth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Utility function to find a column index by name
function findColumnIndex(headers, columnName) {
  const index = headers.indexOf(columnName);
  if (index === -1) throw new Error(`Column "${columnName}" not found.`);
  return index;
}


async function getSheetData() {
  for (let attempt = 1; attempt <= 500; attempt++) {
    try {
  const sheets = google.sheets({ version: 'v4', auth: googleAuth });

 
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${process.env.TAB_NAME}`,
      });

      let rows = response.data.values;
      const headers = rows[0] || [];

      // Find column indexes dynamically
      const websiteUrlIndex = findColumnIndex(headers, 'Website URL');
      let screenshotIndex = headers.indexOf('Screenshot');

      // Add Screenshot column if not exists
      if (screenshotIndex === -1) {
        console.log('Adding Screenshot column...');
        headers.push('Screenshot');
        rows = [headers, ...rows.slice(1).map(row => [...row, ''])];

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${process.env.TAB_NAME}`,
          valueInputOption: 'RAW',
          resource: { values: rows },
        });

        screenshotIndex = headers.length - 1;
      }

      // Convert rows into an array of objects
      const data = rows.slice(1).map((row, rowIndex) => {
        const rowData = headers.reduce((acc, header, index) => {
          acc[header] = row[index] || '';
          return acc;
        }, {});
        rowData._rowIndex = rowIndex + 2; // 1-based row index for Sheets
        return rowData;
      });

      return { headers, data, websiteUrlIndex, screenshotIndex };

    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt === 500) {
        throw new Error('Failed to fetch Google Sheets data after 500 attempts.');
      }
      // Exponential backoff
      await delay(20000 * attempt);
    }
  }
}



async function updateScreenshotColumn(updates, screenshotIndex) {
  for (let attempt = 1; attempt <= 500; attempt++) {
    try {
  const sheets = google.sheets({ version: 'v4', auth: googleAuth });
  const screenshotColumnLetter = String.fromCharCode(65 + screenshotIndex); // A=65

  const values = updates.map((update) => [update.screenshot]);
  const ranges = updates.map((update) => `${process.env.TAB_NAME}!${screenshotColumnLetter}${update.row}`);

  const requests = values.map((value, index) => ({
    range: ranges[index],
    values: [value],
  }));

  const resource = { valueInputOption: 'RAW', data: requests };

  
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource,
      });
      return; // Success
    } catch (error) {
      console.error(`Attempt ${attempt} to update Google Sheets failed: ${error.message}`);
      if (attempt === 500) {
        throw new Error('Failed to update Google Sheets after 500 attempts.');
      }
      // Exponential backoff
      await delay(20000 * attempt);
    }
  }
}



function validateAndFormatUrl(url) {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    new URL(url);
    return url;
  } catch (error) {
    return null;
  }
}

// Function to scroll the entire page
async function scrollPage(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 100;
      let totalHeight = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function takeScreenshot(url, filePath) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      );

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
      await delay(2000);
      await page.keyboard.press('Escape');
      await scrollPage(page);
      await page.keyboard.press('Escape');
      await delay(2000);

      await page.screenshot({
        path: filePath,
        fullPage: true,
        type: 'jpeg',
        quality: 80,
      });

      await browser.close();
      return;
    } catch (error) {
      await browser.close();
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function processBatch(rows, screenshotIndex) {
  const limit = pLimit(3);
  const tasks = rows.map((row) => limit(async () => {
    if (row['Screenshot'] && row['Screenshot'] !== '') {
      console.log(`Skipping already processed URL: ${row['Website URL']}`);
      return null;
    }

    const url = validateAndFormatUrl(row['Website URL']);
    if (!url) {
      console.log(`Invalid URL: ${row['Website URL']}`);
      return { row: row._rowIndex, screenshot: 'Invalid URL' };
    }

    const screenshotFileName = `${url.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const screenshotFilePath = path.join(imagesFolder, screenshotFileName);

    try {
      await takeScreenshot(url, screenshotFilePath);
      return { row: row._rowIndex, screenshot: screenshotFilePath };
    } catch (error) {
      console.log(`Failed to process ${url}: ${error.message}`);
      return { row: row._rowIndex, screenshot: 'Error' };
    }
  }));

  const results = await Promise.all(tasks);
  return results.filter(result => result !== null);
}

async function main() {
  console.log('Fetching data from Google Sheets...');
  const { headers, data, screenshotIndex } = await getSheetData();

  console.log('Processing URLs in batches...');
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);

    const results = await processBatch(batch, screenshotIndex);

    if (results.length > 0) {
      console.log('Updating Google Sheets for this batch...');
      await updateScreenshotColumn(results, screenshotIndex);
      console.log(`Batch ${i / batchSize + 1} completed and updated.`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('All tasks completed successfully!');
}

main().catch((error) => console.error('Error:', error));
