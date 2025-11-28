// FETCH PAGES FROM OLD WEBSITE USING WORDPRESS REST API

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

// Read credentials
const WP_USER = process.env.WP_USER;
const WP_PASS = process.env.WP_PASS;

if (!WP_USER || !WP_PASS) {
  console.error("❌ Missing WP credentials in .env");
  process.exit(1);
}

// Prepare output directory
const OUTPUT_DIR = path.join(process.cwd(), "pages");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Read URLs from urls.txt
const urlsFile = fs.readFileSync("urls.txt", "utf8");
const urls = urlsFile.split("\n").map(u => u.trim()).filter(Boolean);

async function getPageData(url) {
  try {
    // Extract domain
    const { origin } = new URL(url);

    // Try to fetch WP page by slug using REST API
    const slug = url.split("/").filter(Boolean).pop();

    const apiUrl = `${origin}/wp-json/wp/v2/pages?slug=${slug}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64"),
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.log(`❌ Error fetching ${slug}: ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`⚠️ No page found for slug: ${slug}`);
      return;
    }

    const page = data[0]; // first match
    const pageId = page.id;

    // Save JSON
    const filePath = path.join(OUTPUT_DIR, `${pageId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(page, null, 2), "utf8");

    console.log(`✅ Saved ${slug} → pages/${pageId}.json`);

  } catch (error) {
    console.error(`❌ Error processing ${url}:`, error);
  }
}

// Run all
(async () => {
  for (const url of urls) {
    await getPageData(url);
  }
})();
