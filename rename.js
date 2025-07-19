



// import { promises as fsPromises } from 'fs';
// import { google } from 'googleapis';
// import dotenv from 'dotenv';
// import puppeteer from 'puppeteer';
// import path from 'path';

// dotenv.config();

// const { TAB_NAME, GOOGLE_CREDENTIALS, SHEET_URL } = process.env;

// async function withRetries(fn, retries, delay) {
//   let attempt = 0;
//   while (attempt < retries) {
//     try {
//       return await fn();
//     } catch (error) {
//       attempt++;
//       if (attempt >= retries) {
//         throw error;
//       }
//       console.log(`Retrying... (${attempt}/${retries})`);
//       await new Promise((resolve) => setTimeout(resolve, delay));
//     }
//   }
// }

// async function getSheetsClient() {
//   const auth = new google.auth.GoogleAuth({
//     keyFile: path.resolve(GOOGLE_CREDENTIALS),
//     scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//   });
//   const authClient = await auth.getClient();
//   return google.sheets({ version: 'v4', auth: authClient });
// }

// function getSpreadsheetId(url) {
//   const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
//   if (!match) throw new Error('Invalid Google Sheet URL');
//   return match[1];
// }

// async function loadCookies(filePath) {
//   try {
//     const cookies = await fsPromises.readFile(filePath, 'utf-8');
//     return JSON.parse(cookies);
//   } catch (error) {
//     console.error('Failed to load cookies:', error);
//     return [];
//   }
// }

// async function findFirstEmptyRow(dataRows, renameColumnIndex) {
//   let low = 0;
//   let high = dataRows.length - 1;
//   let firstEmptyRow = dataRows.length; // Default to the end if no empty row is found

//   while (low <= high) {
//     const mid = Math.floor((low + high) / 2);

//     if (!dataRows[mid][renameColumnIndex] || dataRows[mid][renameColumnIndex].trim() === '') {
//       // If the mid row is empty, update firstEmptyRow and search the lower half
//       firstEmptyRow = mid;
//       high = mid - 1;
//     } else {
//       // If the mid row is not empty, search the upper half
//       low = mid + 1;
//     }
//   }

//   return firstEmptyRow;
// }

// async function processRow(row, index, page, renameColumnIndex, personalLoomUrlIndex, firstNameIndex, companyNameIndex, websiteURLIndex) {
//   if (row[renameColumnIndex] && row[renameColumnIndex].trim() !== '') {
//     console.log(`Row ${index + 2} already processed.`);
//     return row;
//   }

//   const personalLoomUrl = row[personalLoomUrlIndex];
//   const websiteURL = row[websiteURLIndex];
//   const firstName = row[firstNameIndex];
//   const companyName = row[companyNameIndex];

//   if (!personalLoomUrl || !websiteURL) {
//     console.log(`Row ${index + 2} skipped due to missing data.`);
//     row[renameColumnIndex] = 'Error: Missing data';
//     return row;
//   }

//   const videoIdentifier = `${websiteURL.replace(/[^a-zA-Z0-9]/g, '_')}`;

//   try {
//     await withRetries(async () => {
//       await page.goto(personalLoomUrl, { waitUntil: 'networkidle2', timeout: 120000 });

//       const elementPosition = await page.evaluate((text) => {
//                 const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
//                 let node;
//                 while ((node = walker.nextNode())) {
//                   if (node.nodeValue.trim() === text) {
//                     const range = document.createRange();
//                     range.selectNodeContents(node);
//                     const rect = range.getBoundingClientRect();
//                     return { x: rect.x + rect.width / 3, y: rect.y + rect.height / 3 };
//                   }
//                 }
//                 return null;
//               }, videoIdentifier);
        
//               if (!elementPosition) {
//                 throw new Error('Element not found');
//               }
        
//               const { x, y } = elementPosition;
//               await page.mouse.move(x, y);
//               await page.mouse.click(x, y, { clickCount: 2 });
//               await new Promise(resolve => setTimeout(resolve, 1000));
//               const newTitle = `Personal Video for ${firstName} - ${companyName}`;
//               await page.keyboard.down('Control');
//               await page.keyboard.press('A');
//               await page.keyboard.up('Control');
//               await new Promise(resolve => setTimeout(resolve, 1000));
//               await page.keyboard.press('Backspace');
//               await new Promise(resolve => setTimeout(resolve, 1000));
//               await page.keyboard.type(newTitle);
//               await page.keyboard.press('Enter');
//               await new Promise(resolve => setTimeout(resolve, 1000));
        
//               console.log(`Row ${index + 2}: Renamed to "${newTitle}"`);
//               row[renameColumnIndex] = 'done';
//     }, 3, 5000);
//   } catch (error) {
//     const errorMessage = `Error: ${error.message}`;
//     console.error(`Row ${index + 2} failed: ${errorMessage}`);
//     row[renameColumnIndex] = errorMessage;
//   }

//   return row;
// }

// async function processSheet(batchSize = 1) {
//   const sheets = await getSheetsClient();
//   const spreadsheetId = getSpreadsheetId(SHEET_URL);
//   const cookiesFilePath = './loom_cookies.json';

//   const cookies = await loadCookies(cookiesFilePath);
//   const { data } = await sheets.spreadsheets.values.get({
//     spreadsheetId,
//     range: `${TAB_NAME}`,
//   });

//   const rows = data.values;
//   const headers = rows[0];
//   const dataRows = rows.slice(1);

//   const personalLoomUrlIndex = headers.indexOf('Personal Loom URL');
//   const firstNameIndex = headers.indexOf('First Name');
//   const companyNameIndex = headers.indexOf('Company Name');
//   let renameColumnIndex = headers.indexOf('Rename');
//   const websiteURLIndex = headers.indexOf('Website URL');

//   if (renameColumnIndex === -1) {
//     renameColumnIndex = headers.length;
//     headers.push('Rename');
//     rows[0] = headers;
//   }

//   const browser = await puppeteer.launch({ headless: false});
//   const page = await browser.newPage();
//   await page.setCookie(...cookies);

//   // Find the first empty row in the Rename column
//   const firstEmptyRowIndex = await findFirstEmptyRow(dataRows, renameColumnIndex);

//   // Process rows starting from the first empty row
//   for (let i = firstEmptyRowIndex; i < dataRows.length; i += batchSize) {
//     const batch = dataRows.slice(i, i + batchSize);
//     console.log(`Processing batch ${Math.floor((i - firstEmptyRowIndex) / batchSize) + 1}...`);

//     await Promise.all(
//       batch.map((row, index) =>
//         processRow(row, i + index, page, renameColumnIndex, personalLoomUrlIndex, firstNameIndex, companyNameIndex, websiteURLIndex)
//       )
//     );

//     await withRetries(async () => {
//       await sheets.spreadsheets.values.update({
//         spreadsheetId,
//         range: `${TAB_NAME}`,
//         valueInputOption: 'RAW',
//         requestBody: {
//           values: [headers, ...dataRows],
//         },
//       });
//     }, 500, 10000);

//     console.log(`Batch ${Math.floor((i - firstEmptyRowIndex) / batchSize) + 1} processed and updated.`);
//   }

//   await browser.close();
//   console.log('All rows processed successfully.');
// }

// processSheet().catch((error) => {
//   console.error('Error:', error);
// });



import { promises as fsPromises } from 'fs';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import path from 'path';

dotenv.config();

const { TAB_NAME, GOOGLE_CREDENTIALS, SHEET_URL } = process.env;

async function withRetries(fn, retries, delay) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      console.log(`Retrying... (${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

function getSpreadsheetId(url) {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheet URL');
  return match[1];
}

async function loadCookies(filePath) {
  try {
    const cookies = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(cookies);
  } catch (error) {
    console.error('Failed to load cookies:', error);
    return [];
  }
}

async function findFirstEmptyRow(dataRows, renameColumnIndex) {
  let low = 0;
  let high = dataRows.length - 1;
  let firstEmptyRow = dataRows.length; // Default to the end if no empty row is found

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (!dataRows[mid][renameColumnIndex] || dataRows[mid][renameColumnIndex].trim() === '') {
      // If the mid row is empty, update firstEmptyRow and search the lower half
      firstEmptyRow = mid;
      high = mid - 1;
    } else {
      // If the mid row is not empty, search the upper half
      low = mid + 1;
    }
  }

  return firstEmptyRow;
}

async function processRow(row, index, page, renameColumnIndex, personalLoomUrlIndex, firstNameIndex, companyNameIndex, websiteURLIndex) {
  if (row[renameColumnIndex] && row[renameColumnIndex].trim() !== '') {
    console.log(`Row ${index + 2} already processed.`);
    return row;
  }

  const personalLoomUrl = row[personalLoomUrlIndex];
  const websiteURL = row[websiteURLIndex];
  const firstName = row[firstNameIndex];
  const companyName = row[companyNameIndex];

  if (!personalLoomUrl || !websiteURL) {
    console.log(`Row ${index + 2} skipped due to missing data.`);
    row[renameColumnIndex] = 'Error: Missing data';
    return row;
  }

  const videoIdentifier = `${websiteURL.replace(/[^a-zA-Z0-9]/g, '_')}`;

  try {
    await withRetries(async () => {
      await page.goto(personalLoomUrl, { waitUntil: 'networkidle2', timeout: 120000 });

      const elementPosition = await page.evaluate((text) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue.trim() === text) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            return { x: rect.x + rect.width / 3, y: rect.y + rect.height / 10 };
          }
        }
        return null;
      }, videoIdentifier);

      if (!elementPosition) {
        throw new Error('Element not found');
      }

      const { x, y } = elementPosition;
      // Draw a point where the double-click will occur
      await page.evaluate(({ x, y }) => {
        const marker = document.createElement('div');
        marker.style.position = 'absolute';
        marker.style.top = `${y}px`;
        marker.style.left = `${x}px`;
        marker.style.width = '10px';
        marker.style.height = '10px';
        marker.style.backgroundColor = 'red';
        marker.style.borderRadius = '50%';
        marker.style.zIndex = '10000';
        document.body.appendChild(marker);
      }, { x, y });

      await page.mouse.move(x, y);
      await page.mouse.click(x, y, { clickCount: 2 });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newTitle = `Personal Video for ${firstName} - ${companyName}`;
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.keyboard.press('Backspace');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.keyboard.type(newTitle, { delay: 100 }); // Add delay for smoother typing
      await new Promise(resolve => setTimeout(resolve, 1000));
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`Row ${index + 2}: Renamed to "${newTitle}"`);
      row[renameColumnIndex] = 'done';
    }, 3, 5000);
  } catch (error) {
    const errorMessage = `Error: ${error.message}`;
    console.error(`Row ${index + 2} failed: ${errorMessage}`);
    row[renameColumnIndex] = errorMessage;
  }

  return row;
}

async function processSheet(batchSize = 3) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId(SHEET_URL);
  const cookiesFilePath = './loom_cookies.json';

  const cookies = await loadCookies(cookiesFilePath);
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB_NAME}`,
  });

  const rows = data.values;
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const personalLoomUrlIndex = headers.indexOf('Personal Loom URL');
  const firstNameIndex = headers.indexOf('First Name');
  const companyNameIndex = headers.indexOf('Company Name');
  let renameColumnIndex = headers.indexOf('Rename');
  const websiteURLIndex = headers.indexOf('Website URL');

  if (renameColumnIndex === -1) {
    renameColumnIndex = headers.length;
    headers.push('Rename');
    rows[0] = headers;
  }

  const browser = await puppeteer.launch({ headless:false });
  const page = await browser.newPage();
  await page.setCookie(...cookies);

  // Find the first empty row in the Rename column
  const firstEmptyRowIndex = await findFirstEmptyRow(dataRows, renameColumnIndex);

  // Process rows starting from the first empty row
  for (let i = firstEmptyRowIndex; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor((i - firstEmptyRowIndex) / batchSize) + 1}...`);

    await Promise.all(
      batch.map((row, index) =>
        processRow(row, i + index, page, renameColumnIndex, personalLoomUrlIndex, firstNameIndex, companyNameIndex, websiteURLIndex)
      )
    );

    await withRetries(async () => {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB_NAME}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers, ...dataRows],
        },
      });
    }, 500, 10000);

    console.log(`Batch ${Math.floor((i - firstEmptyRowIndex) / batchSize) + 1} processed and updated.`);
  }

  await browser.close();
  console.log('All rows processed successfully.');
}

processSheet().catch((error) => {
  console.error('Error:', error);
});
