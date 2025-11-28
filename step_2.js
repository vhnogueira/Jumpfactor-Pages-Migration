// POST PAGES TO NEW WORDPRESS STAGING SITE WITH IMAGE UPLOADS

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

// ========== CONFIGURATION ==========
const TEST_MODE = true;
const UPLOAD_NEW_IMAGES = false;
const CLEAR_INTERLINKING = true;

const STAGING_URL = process.env.STAGING_URL;
const STAGING_USER = process.env.STAGING_USER;
const STAGING_PASS = process.env.STAGING_PASS;

const IMAGE_FIELDS = [
  "image_text_section_1_image",
  "image_text_section_2_image",
  "image_text_section_3_image",
  "image_text_section_4_image",
  "about_us_image",
];

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// ========== UTILITY FUNCTIONS ==========

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthHeader() {
  const authToken = Buffer.from(`${STAGING_USER}:${STAGING_PASS}`).toString(
    "base64"
  );
  return `Basic ${authToken}`;
}

async function fetchWithRetry(url, options, maxAttempts = MAX_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return await response.json();
      }

      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    } catch (error) {
      lastError = error;

      console.log(
        `  ⚠️  Attempt ${attempt}/${maxAttempts} failed: ${error.message}`
      );

      if (attempt < maxAttempts) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`  ⏳ Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError.message}`);
}

// ========== ICON MATCHING SYSTEM ==========

// Predefined mappings for common service titles
const SERVICE_ICON_MAPPINGS = {
  // Exact matches (case-insensitive)
  "managed it services": "shield-2",
  "it consulting": "analytics-2",
  "it helpdesk": "helpdesk",
  "network support": "Network",
  "network management": "Network",
  "cloud services": "Cloud App",
  "cloud solutions": "cloud-1",
  "cloud integration": "cloud-connect",
  "cybersecurity": "firewall",
  "cybersecurity solutions": "shield-2",
  "cybersecurity protection": "shield-3",
  "it support": "headphones",
  "24/7 it support": "helpdesk",
  "24/7 live support": "helpdesk-head",
  "data backup and recovery": "backup-files",
  "data backup & recovery": "backup-files",
  "it compliance and audits": "certificate",
  "compliance solutions": "certificate-2",
  "voip services": "phone-1",
  "voip solutions": "phone-2",
  "strategic it consulting": "business-2",
  "device management": "Monitoring",
  "business continuity": "business-3",
  "help desk": "headphones",
  "cloud computing": "Cloud Internet",
  "security": "shield-2",
  "backup": "backup-files",
  "disaster recovery": "business-3",
};

// Keyword-based fallback mappings
const KEYWORD_ICON_MAPPINGS = {
  cloud: "cloud-1",
  security: "shield-2",
  cyber: "firewall",
  network: "Network",
  backup: "backup-files",
  recovery: "backup-files",
  voip: "phone-1",
  phone: "phone-2",
  call: "phone-1",
  helpdesk: "helpdesk",
  support: "headphones",
  help: "helpdesk-head",
  consult: "analytics-2",
  monitor: "Monitoring",
  compliance: "certificate",
  audit: "certificate-2",
  manage: "gear-man",
  device: "monitor-1",
  data: "Folder Data",
  analytics: "analytics-2",
  business: "business-2",
  continuity: "business-3",
};

// Fallback icon preference order
const FALLBACK_ICONS = ["gear-man", "business-2", "apps"];

function loadIconLibrary() {
  const iconCsvPath = path.join(process.cwd(), "icon_files.csv");

  if (!fs.existsSync(iconCsvPath)) {
    console.warn("⚠️  icon_files.csv not found. Icons will not be assigned.");
    return [];
  }

  try {
    const csvContent = fs.readFileSync(iconCsvPath, "utf8");
    const lines = csvContent.trim().split("\n");

    // Skip header row
    const dataLines = lines.slice(1);

    const iconLibrary = dataLines
      .map((line) => {
        const [id, title, filename, url, alt_text] = line.split(",");

        // Only process icons with "Icon=" prefix
        if (!title || !title.startsWith("Icon=")) {
          return null;
        }

        // Extract icon name from title (e.g., "Icon=Shield" → "Shield")
        const iconName = title.replace("Icon=", "").trim();

        return {
          id: parseInt(id, 10),
          title: title.trim(),
          iconName,
          filename: filename ? filename.trim() : "",
          url: url ? url.trim() : "",
        };
      })
      .filter((icon) => icon !== null);

    return iconLibrary;
  } catch (error) {
    console.error(`❌ Error parsing icon_files.csv: ${error.message}`);
    return [];
  }
}

function normalizeServiceTitle(htmlTitle) {
  if (!htmlTitle || typeof htmlTitle !== "string") {
    return "";
  }

  // Strip HTML tags
  let cleaned = htmlTitle.replace(/<[^>]*>/g, "");

  // Convert to lowercase
  cleaned = cleaned.toLowerCase();

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

function findAvailableIcon(iconName, iconLibrary, usedIconIds) {
  // Find icon by iconName that is not in usedIconIds
  const icon = iconLibrary.find(
    (icon) =>
      icon.iconName.toLowerCase() === iconName.toLowerCase() &&
      !usedIconIds.has(icon.id)
  );

  return icon || null;
}

function scoreIconByKeywords(normalizedTitle, iconName) {
  let score = 0;

  // Split normalized title into words
  const words = normalizedTitle.split(" ");

  // Check each word against keyword mappings
  for (const word of words) {
    const mappedIcon = KEYWORD_ICON_MAPPINGS[word];
    if (mappedIcon && mappedIcon.toLowerCase() === iconName.toLowerCase()) {
      score += 2; // Higher score for keyword match
    }
  }

  // Check if icon name appears anywhere in title
  if (normalizedTitle.includes(iconName.toLowerCase())) {
    score += 1;
  }

  return score;
}

function findBestIconMatch(serviceTitle, iconLibrary, usedIconIds) {
  // Step 1: Normalize service title
  const normalizedTitle = normalizeServiceTitle(serviceTitle);

  if (!normalizedTitle) {
    return null;
  }

  // Step 2: Try exact match in predefined mappings
  if (SERVICE_ICON_MAPPINGS[normalizedTitle]) {
    const iconName = SERVICE_ICON_MAPPINGS[normalizedTitle];
    const icon = findAvailableIcon(iconName, iconLibrary, usedIconIds);
    if (icon) {
      return icon;
    }
  }

  // Step 3: Try keyword-based matching
  const availableIcons = iconLibrary.filter(
    (icon) => !usedIconIds.has(icon.id)
  );

  if (availableIcons.length === 0) {
    return null; // No icons left
  }

  // Score each available icon
  let bestIcon = null;
  let bestScore = 0;

  for (const icon of availableIcons) {
    const score = scoreIconByKeywords(normalizedTitle, icon.iconName);
    if (score > bestScore) {
      bestScore = score;
      bestIcon = icon;
    }
  }

  // If we found a match with score > 0, return it
  if (bestIcon && bestScore > 0) {
    return bestIcon;
  }

  // Step 4: Fallback - try to use generic icons
  for (const fallbackName of FALLBACK_ICONS) {
    const icon = findAvailableIcon(fallbackName, iconLibrary, usedIconIds);
    if (icon) {
      return icon;
    }
  }

  // Step 5: Last resort - return any available icon
  return availableIcons.length > 0 ? availableIcons[0] : null;
}

function assignIconsToServices(services, iconLibrary) {
  if (!services || !Array.isArray(services) || services.length === 0) {
    return services;
  }

  if (!iconLibrary || iconLibrary.length === 0) {
    console.warn("  ⚠️  No icons available in library");
    return services;
  }

  const usedIconIds = new Set();

  console.log(`  Assigning icons to ${services.length} services...`);

  for (const service of services) {
    if (!service.service_title) {
      continue;
    }

    const icon = findBestIconMatch(
      service.service_title,
      iconLibrary,
      usedIconIds
    );

    if (icon) {
      service.service_icon = icon.id;
      usedIconIds.add(icon.id);
      console.log(
        `    "${normalizeServiceTitle(service.service_title)}" → ${icon.iconName} (${icon.id})`
      );
    } else {
      console.warn(
        `    ⚠️  No unique icon found for: "${normalizeServiceTitle(service.service_title)}"`
      );
      service.service_icon = null;
    }
  }

  console.log(`  ✓ Icons assigned: ${usedIconIds.size} unique icons used`);

  return services;
}

// ========== WORDPRESS API FUNCTIONS ==========

async function createPage(payload) {
  try {
    return await fetchWithRetry(`${STAGING_URL}/wp-json/wp/v2/pages`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`  ❌ Failed to create page: ${error.message}`);
    throw error;
  }
}

async function updatePage(pageId, payload) {
  try {
    return await fetchWithRetry(
      `${STAGING_URL}/wp-json/wp/v2/pages/${pageId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
  } catch (error) {
    console.error(`  ❌ Failed to update page ${pageId}: ${error.message}`);
    throw error;
  }
}

async function uploadImage(imagePath, title) {
  try {
    const form = new FormData();
    const imageBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);

    form.append("file", imageBuffer, { filename: fileName });
    form.append("title", title);
    form.append("alt_text", title);

    const response = await fetchWithRetry(
      `${STAGING_URL}/wp-json/wp/v2/media`,
      {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(),
          ...form.getHeaders(),
        },
        body: form,
      }
    );

    return response.id;
  } catch (error) {
    console.error(`  ❌ Failed to upload image ${imagePath}: ${error.message}`);
    throw error;
  }
}

// ========== JSON FUNCTIONS ==========

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const jsonContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(jsonContent);
}

function writeJSON(filePath, records) {
  const jsonContent = JSON.stringify(records, null, 2);
  fs.writeFileSync(filePath, jsonContent, "utf8");
}

function findRecordByOriginId(records, originId) {
  return records.find((r) => r.originId === String(originId));
}

// ========== IMAGE FUNCTIONS ==========

let imagePool = [];

function loadImagePool() {
  const imagesDir = path.join(process.cwd(), "images");
  imagePool = fs
    .readdirSync(imagesDir)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => path.join(imagesDir, f));
}

function selectRandomUniqueImages(count) {
  // Fisher-Yates shuffle
  const shuffled = [...imagePool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

function trackImageFields(pageData) {
  const fieldsWithValues = [];

  IMAGE_FIELDS.forEach((field) => {
    const value = pageData.acf && pageData.acf[field];
    if (value && value !== "" && value !== null) {
      fieldsWithValues.push(field);
    }
  });

  return fieldsWithValues;
}

// ========== DATA PROCESSING FUNCTIONS ==========

function sanitizeAcfData(acfData) {
  // Recursively clean ACF data and remove problematic icon fields
  if (Array.isArray(acfData)) {
    return acfData.map((item) => sanitizeAcfData(item));
  }

  if (acfData && typeof acfData === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(acfData)) {
      // Skip ONLY the "icon" field, but KEEP "service_icon"
      if (key === "icon") {
        continue;
      }

      // Skip interlinking field if CLEAR_INTERLINKING is enabled
      if (CLEAR_INTERLINKING && key === "interlinks") {
        continue;
      }

      if (value === "") {
        sanitized[key] = null;
      } else if (typeof value === "object") {
        sanitized[key] = sanitizeAcfData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return acfData;
}

function extractFieldsForWordPress(pageData) {
  const acfData = { ...pageData.acf };
  const sanitizedAcf = sanitizeAcfData(acfData);

  // Add disable_automatic_interlinking field
  sanitizedAcf.disable_automatic_interlinking = false;

  return {
    title: pageData.title.rendered,
    slug: pageData.slug,
    status: pageData.status,
    content: pageData.content.rendered,
    "page-category": [10],
    acf: sanitizedAcf,
  };
}

// ========== MAIN PROCESSING FUNCTIONS ==========

async function processPage(jsonFile, jsonRecords, index, total, iconLibrary) {
  const pageData = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  const originId = pageData.id;
  const pageTitle = pageData.title.rendered;

  console.log(`\n[${index}/${total}] Processing: ${pageTitle}`);
  console.log(`  Origin ID: ${originId}`);

  // Check if page already exists in JSON
  const existingRecord = findRecordByOriginId(jsonRecords, originId);
  const isUpdate = !!existingRecord;

  console.log(`  Mode: ${isUpdate ? "UPDATE" : "CREATE"}`);

  // Assign icons to services before processing
  if (pageData.acf && pageData.acf.services_repeater) {
    pageData.acf.services_repeater = assignIconsToServices(
      pageData.acf.services_repeater,
      iconLibrary
    );
  }

  // Extract fields to send
  const payload = extractFieldsForWordPress(pageData);

  // Track image fields that have values
  const imageFieldsWithValues = trackImageFields(pageData);
  console.log(`  Image fields with values: ${imageFieldsWithValues.length}`);

  // Remove all image fields from payload (don't send them at all in initial request)
  IMAGE_FIELDS.forEach((field) => {
    if (payload.acf && payload.acf[field] !== undefined) {
      delete payload.acf[field];
    }
  });

  // Create or update page
  let response;
  if (isUpdate) {
    console.log(`  Updating existing page ID: ${existingRecord.pageId}`);
    response = await updatePage(existingRecord.pageId, payload);
  } else {
    console.log(`  Creating new page...`);
    response = await createPage(payload);
  }

  const newPageId = response.id;
  const newPageUrl = response.link;

  console.log(`  ✓ Page ${isUpdate ? "updated" : "created"}: ID ${newPageId}`);

  // Handle image uploads
  const mediaIds = {};

  // Check if existing record has any media IDs
  const hasExistingMedia =
    existingRecord && IMAGE_FIELDS.some((field) => existingRecord[field]);

  // Decide if we should upload images
  const shouldUploadImages =
    UPLOAD_NEW_IMAGES || !isUpdate || (isUpdate && !hasExistingMedia);

  if (shouldUploadImages && imageFieldsWithValues.length > 0) {
    console.log(`  Uploading ${imageFieldsWithValues.length} images...`);

    const selectedImages = selectRandomUniqueImages(
      imageFieldsWithValues.length
    );

    for (let i = 0; i < imageFieldsWithValues.length; i++) {
      const fieldName = imageFieldsWithValues[i];
      const imagePath = selectedImages[i];

      console.log(`    Uploading image for ${fieldName}...`);
      const mediaId = await uploadImage(imagePath, pageTitle);
      mediaIds[fieldName] = mediaId;
      console.log(`    ✓ Uploaded: Media ID ${mediaId}`);
    }

    // Update page with media IDs
    console.log(`  Updating page with image IDs...`);
    const updatePayload = {
      acf: mediaIds,
    };
    await updatePage(newPageId, updatePayload);
    console.log(`  ✓ Images updated on page`);
  } else if (isUpdate && hasExistingMedia) {
    // Preserve existing media IDs from JSON
    console.log(`  Preserving existing media IDs from JSON`);
    IMAGE_FIELDS.forEach((field) => {
      if (existingRecord[field]) {
        mediaIds[field] = existingRecord[field];
      }
    });
  } else {
    console.log(
      `  Skipping image upload (UPLOAD_NEW_IMAGES = ${UPLOAD_NEW_IMAGES})`
    );
  }

  // Create JSON record
  const jsonRecord = {
    originId: String(originId),
    pageId: String(newPageId),
    title: pageTitle,
    url: newPageUrl,
    ...mediaIds,
  };

  // Update JSON records array
  if (isUpdate) {
    Object.assign(existingRecord, jsonRecord);
  } else {
    jsonRecords.push(jsonRecord);
  }

  console.log(`  ✓ JSON record updated`);

  return jsonRecord;
}

// ========== ICON/SVG MEDIA FUNCTIONS ==========

async function fetchAllSvgMedia() {
  console.log("Fetching all SVG media files from WordPress...");

  const allSvgMedia = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${STAGING_URL}/wp-json/wp/v2/media?per_page=100&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const mediaItems = await response.json();

      if (mediaItems.length === 0) {
        hasMore = false;
      } else {
        // Filter only SVG files with titles starting with "Typer=" or "Icon="
        const svgItems = mediaItems.filter((item) => {
          if (item.mime_type !== "image/svg+xml") return false;
          const title = item.title?.rendered || "";
          return title.startsWith("Typer=") || title.startsWith("Icon=");
        });
        allSvgMedia.push(...svgItems);
        console.log(
          `  Fetched page ${page}: ${svgItems.length} SVG files (${mediaItems.length} total items)`
        );
        page++;
      }
    } catch (error) {
      console.error(`  Error fetching media page ${page}: ${error.message}`);
      hasMore = false;
    }
  }

  return allSvgMedia;
}

function saveSvgMediaToCsv(mediaItems, filePath) {
  // Sort by ID ascending
  const sortedItems = [...mediaItems].sort((a, b) => a.id - b.id);

  // Remove all items with ID less than 20813
  const filteredItems = sortedItems.filter((item) => item.id >= 20813);

  // Remove duplicates based on title (keep first occurrence)
  const seenTitles = new Set();
  const uniqueItems = filteredItems.filter((item) => {
    const title = item.title?.rendered || "";
    if (seenTitles.has(title)) {
      return false;
    }
    seenTitles.add(title);
    return true;
  });

  const headers = ["id", "title", "filename", "url", "alt_text"];
  const rows = [headers];

  uniqueItems.forEach((item) => {
    rows.push([
      item.id,
      item.title?.rendered || "",
      item.source_url?.split("/").pop() || "",
      item.source_url || "",
      item.alt_text || "",
    ]);
  });

  const csvContent = rows.map((row) => row.join(",")).join("\n");
  fs.writeFileSync(filePath, csvContent, "utf8");
}

async function loadOrFetchSvgMedia() {
  const iconCsvPath = path.join(process.cwd(), "icon_files.csv");

  if (fs.existsSync(iconCsvPath)) {
    console.log(`✓ icon_files.csv already exists, skipping SVG media fetch\n`);
    return;
  }

  console.log(
    "icon_files.csv not found, fetching SVG media from WordPress...\n"
  );
  const svgMedia = await fetchAllSvgMedia();

  saveSvgMediaToCsv(svgMedia, iconCsvPath);
  console.log(`✓ Saved ${svgMedia.length} SVG files to icon_files.csv\n`);
}

// ========== MAIN EXECUTION ==========

async function main() {
  console.log("🚀 WordPress Page Migration Started\n");

  // Validate environment variables
  if (!STAGING_URL || !STAGING_USER || !STAGING_PASS) {
    throw new Error("Missing environment variables. Check .env file.");
  }

  console.log(`Configuration:`);
  console.log(`  STAGING_URL: ${STAGING_URL}`);
  console.log(`  TEST_MODE: ${TEST_MODE}`);
  console.log(`  UPLOAD_NEW_IMAGES: ${UPLOAD_NEW_IMAGES}`);
  console.log(`  CLEAR_INTERLINKING: ${CLEAR_INTERLINKING}\n`);

  // Load or fetch SVG media files
  await loadOrFetchSvgMedia();

  // Load icon library for service icon matching
  const iconLibrary = loadIconLibrary();
  console.log(`✓ Loaded ${iconLibrary.length} icons from icon_files.csv\n`);

  // Load image pool
  loadImagePool();
  console.log(`✓ Loaded ${imagePool.length} images from /images/\n`);

  // Load or create JSON
  const jsonPath = path.join(process.cwd(), "created_pages.json");
  const jsonRecords = loadJSON(jsonPath);
  console.log(`✓ Loaded ${jsonRecords.length} existing records from JSON\n`);

  // Get JSON files
  const pagesDir = path.join(process.cwd(), "pages");
  let jsonFiles = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(pagesDir, f));

  if (TEST_MODE) {
    jsonFiles = jsonFiles.slice(0, 1);
    console.log("⚠️  TEST_MODE enabled - processing first page only\n");
  }

  console.log(`Processing ${jsonFiles.length} page(s)...\n`);
  console.log("─".repeat(60));

  // Process pages
  const results = [];
  for (let i = 0; i < jsonFiles.length; i++) {
    try {
      const result = await processPage(
        jsonFiles[i],
        jsonRecords,
        i + 1,
        jsonFiles.length,
        iconLibrary
      );
      results.push({ success: true, result });
    } catch (error) {
      console.error(`\n❌ Failed to process ${jsonFiles[i]}: ${error.message}`);
      results.push({ success: false, error: error.message });
    }
  }

  console.log("\n" + "─".repeat(60));

  // Write JSON
  writeJSON(jsonPath, jsonRecords);
  console.log(`\n✓ Updated ${jsonPath}`);

  // Summary
  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;

  console.log(`\n✅ Migration Complete!`);
  console.log(`  Success: ${successes}/${jsonFiles.length}`);
  if (failures > 0) {
    console.log(`  Failed: ${failures}/${jsonFiles.length}`);
  }
  console.log(`\nNext steps:`);
  if (TEST_MODE) {
    console.log(`  1. Verify the page on ${STAGING_URL}`);
    console.log(`  2. Check created_pages.json for results`);
    console.log(`  3. Run again to test UPDATE logic`);
    console.log(`  4. Set TEST_MODE = false to process all pages`);
  } else {
    console.log(`  1. Review all pages on ${STAGING_URL}`);
    console.log(
      `  2. Verify created_pages.json has all ${jsonFiles.length} records`
    );
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error.message);
  process.exit(1);
});
