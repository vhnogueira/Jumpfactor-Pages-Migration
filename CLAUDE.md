# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WordPress page migration tool designed to extract pages from one WordPress site and migrate them to a staging WordPress site. The migration process is split into two distinct phases:

1. **Step 1** (`step_1.js`): Fetches page data from the original WordPress site using the WordPress REST API
2. **Step 2** (`step_2.js`): Posts the fetched pages to a staging WordPress site, handling image uploads and ACF (Advanced Custom Fields) data

## Architecture

### Two-Phase Migration Process

**Phase 1: Data Extraction**
- Reads URLs from `urls.txt` (one URL per line)
- Uses WordPress REST API to fetch page data by slug
- Authenticates using Basic Auth with credentials from `.env`
- Saves each page as JSON in the `pages/` directory, named by page ID (e.g., `21718.json`)

**Phase 2: Data Import**
- Reads JSON files from `pages/` directory
- Creates or updates pages on staging WordPress site
- Handles Advanced Custom Fields (ACF) data with special sanitization
- Manages image uploads and tracks them via JSON
- Maintains state in `created_pages.json` to support incremental updates

### Key Data Flows

1. **Icon/SVG Handling**: The script removes `icon` and `service_icon` fields from ACF data during sanitization to avoid upload issues
2. **Image Management**: Uses random images from `images/` directory (WebP format) for image fields, tracked in JSON to prevent re-uploading
3. **JSON State Tracking**: `created_pages.json` maps origin page IDs to new page IDs and tracks uploaded image media IDs
4. **Icon Inventory**: `icon_files.csv` catalogs all SVG media files (Typer= and Icon= prefixed) from the staging site

### Configuration Flags (step_2.js)

- `TEST_MODE`: When `true`, processes only the first page (for testing)
- `UPLOAD_NEW_IMAGES`: When `false`, reuses existing image media IDs from JSON

## Running the Scripts

### Prerequisites

Ensure `.env` file exists with required credentials:
```
WP_USER=user@example.com
WP_PASS=application_password
STAGING_PASS=staging_password
STAGING_USER=staging@example.com
STAGING_URL=https://staging.example.com
```

### Execution Commands

**Step 1 - Fetch pages from original site:**
```bash
node step_1.js
```

**Step 2 - Upload pages to staging site:**
```bash
node step_2.js
```

Note: These are ES6 modules (use `import` syntax), so ensure you have a `package.json` with `"type": "module"` or use `.mjs` extension.

### Dependencies

Required npm packages (based on imports):
- `node-fetch` - HTTP client for WordPress REST API calls
- `form-data` - Multipart form data for image uploads
- `dotenv` - Environment variable management

Install with:
```bash
npm install node-fetch form-data dotenv
```

## Data Structure

### Page JSON Structure

Each page JSON file (e.g., `pages/21718.json`) contains:
- Standard WordPress fields: `id`, `title`, `slug`, `status`, `content`
- Custom taxonomies: `page-category`, `city`, `service`
- `acf` object: Contains all Advanced Custom Fields including:
  - Form sections with icons and headings
  - Testimonials, stats, about video
  - Service repeaters with `service_icon` references
  - Image text sections (1-4) with image field references
  - FAQ sections
  - Interlinks sections

### Data Files

**created_pages.json** - Tracks migration progress (array of objects):
- `originId`: Original page ID from source site
- `pageId`: New page ID on staging site
- `title`, `url`: Page metadata
- Image field properties: `image_text_section_1_image` through `image_text_section_4_image`, `about_us_image` (stores media IDs)

**icon_files.csv** - Inventory of SVG icons on staging site:
- `id`, `title`, `filename`, `url`, `alt_text`
- Only includes SVGs with titles starting with "Typer=" or "Icon="
- Filtered to IDs >= 20813
- Deduplicated by title

## Important Implementation Details

### ACF Data Sanitization

The `sanitizeAcfData()` function:
- Converts empty strings to `null` for WordPress compatibility
- **Recursively removes** all `icon` and `service_icon` fields to prevent upload conflicts
- Recursively processes nested objects and arrays

### Retry Logic

API requests use exponential backoff retry (3 attempts by default):
- Initial delay: 1000ms
- Exponential multiplier: 2x per retry
- Handles transient network failures gracefully

### Image Field Handling

Five special ACF image fields are tracked:
- `image_text_section_1_image`
- `image_text_section_2_image`
- `image_text_section_3_image`
- `image_text_section_4_image`
- `about_us_image`

Images are:
1. Randomly selected from `images/` directory (WebP files only)
2. Uploaded to staging site via WordPress media endpoint
3. Media IDs stored in JSON for future updates
4. Assigned to ACF fields via second PATCH request

### Update vs Create Logic

Script checks `created_pages.json` by `originId`:
- If found: PATCH existing page (update mode)
- If not found: POST new page (create mode)

## Workflow Tips

1. **Initial Migration**: Set `TEST_MODE = true`, run `step_2.js` on one page to verify setup
2. **Full Migration**: Set `TEST_MODE = false` to process all pages
3. **Re-running**: Script is idempotent - pages are updated if they exist, created if they don't
4. **Image Uploads**: Toggle `UPLOAD_NEW_IMAGES` to control whether images are re-uploaded on updates

## File Organization

```
pages migration/
├── .env                    # Credentials (never commit)
├── urls.txt               # Source page URLs (input)
├── step_1.js              # Phase 1: Fetch from source
├── step_2.js              # Phase 2: Upload to staging
├── pages/                 # Fetched page JSON files
│   └── {pageId}.json
├── images/                # Source images for upload (.webp)
├── created_pages.json     # Migration state tracking
└── icon_files.csv         # SVG icon inventory
```
