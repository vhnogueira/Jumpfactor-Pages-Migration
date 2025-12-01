# WordPress Page Migration Tool

A two-phase migration tool designed to extract pages from a WordPress site and migrate them to a staging environment, including handling of Advanced Custom Fields (ACF) and media files.

## Overview

This tool automates the process of migrating WordPress pages between environments while preserving:
- Page content and metadata
- Custom taxonomies (categories, cities, services)
- Advanced Custom Fields (ACF) data
- Media files and images

## Prerequisites

- Node.js (ES6 modules support)
- Access to both source and staging WordPress sites
- WordPress Application Passwords enabled on both sites
- WordPress REST API accessible

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

Required packages:
- `node-fetch` - HTTP client for WordPress REST API
- `form-data` - Multipart form data for image uploads
- `dotenv` - Environment variable management

3. Create a `.env` file in the root directory:
```env
WP_USER=user@example.com
WP_PASS=your_application_password
STAGING_USER=staging@example.com
STAGING_PASS=staging_application_password
STAGING_URL=https://staging.example.com
```

4. Create a `urls.txt` file with the URLs of pages to migrate (one per line):
```
https://example.com/page-slug-1/
https://example.com/page-slug-2/
https://example.com/page-slug-3/
```

## Usage

### Step 1: Extract Pages from Source Site

```bash
node step_1.js
```

This script will:
- Read URLs from `urls.txt`
- Fetch page data from the source WordPress site using the REST API
- Save each page as a JSON file in the `pages/` directory (named by page ID)

### Step 2: Import Pages to Staging Site

```bash
node step_2.js
```

This script will:
- Read JSON files from the `pages/` directory
- Create or update pages on the staging WordPress site
- Handle ACF data with proper sanitization
- Upload images and track them for incremental updates
- Save progress in `created_pages.json`

## Configuration

### Step 2 Configuration Flags

Edit `step_2.js` to modify behavior:

- **`TEST_MODE`**: Set to `true` to process only the first page (recommended for initial testing)
  ```javascript
  const TEST_MODE = true; // Test with one page
  ```

- **`UPLOAD_NEW_IMAGES`**: Set to `false` to reuse existing image media IDs from previous runs
  ```javascript
  const UPLOAD_NEW_IMAGES = false; // Skip re-uploading images
  ```

## Project Structure

```
pages migration/
├── .env                    # Environment variables (credentials)
├── .gitignore             # Git ignore file
├── package.json           # Node.js dependencies
├── README.md              # This file
├── urls.txt               # Input: URLs to migrate
├── step_1.js              # Phase 1: Fetch from source
├── step_2.js              # Phase 2: Upload to staging
├── pages/                 # Fetched page JSON files
│   └── {pageId}.json
├── images/                # Source images for upload (.webp)
├── created_pages.json     # Migration state tracking
└── icon_files.csv         # SVG icon inventory (optional)
```

## How It Works

### Phase 1: Data Extraction (step_1.js)

1. Reads page URLs from `urls.txt`
2. Extracts the slug from each URL
3. Fetches complete page data via WordPress REST API
4. Saves each page as `pages/{pageId}.json`

### Phase 2: Data Import (step_2.js)

1. Reads all JSON files from `pages/` directory
2. For each page:
   - Checks if page already exists in `created_pages.json`
   - Creates new page (POST) or updates existing page (PATCH)
   - Sanitizes ACF data (removes problematic fields)
   - Uploads images from `images/` directory
   - Assigns image media IDs to ACF fields
   - Updates `created_pages.json` with progress

### State Management

The script maintains state in `created_pages.json` to support:
- Incremental updates (re-running the script won't duplicate pages)
- Image tracking (prevents re-uploading the same images)
- Progress monitoring

## Features

### ACF Data Sanitization

The tool automatically:
- Converts empty strings to `null` for WordPress compatibility
- Removes `icon` and `service_icon` fields to prevent upload conflicts
- Recursively processes nested ACF objects and arrays

### Image Management

- Randomly selects images from the `images/` directory
- Uploads images to staging site media library
- Tracks uploaded media IDs in `created_pages.json`
- Reuses existing media IDs on subsequent runs (when `UPLOAD_NEW_IMAGES = false`)

### Error Handling

- Exponential backoff retry logic (3 attempts)
- Detailed error logging
- Graceful handling of network failures

## Workflow

### Initial Setup and Testing

1. Set `TEST_MODE = true` in `step_2.js`
2. Run `node step_2.js` to test with one page
3. Verify the page was created correctly on staging
4. Check `created_pages.json` for proper tracking

### Full Migration

1. Set `TEST_MODE = false` in `step_2.js`
2. Run `node step_2.js` to process all pages
3. Monitor console output for progress and errors

### Re-running or Updating

The script is idempotent:
- Existing pages will be updated (PATCH)
- New pages will be created (POST)
- Set `UPLOAD_NEW_IMAGES = false` to skip re-uploading images

## Troubleshooting

### Authentication Errors

- Verify WordPress Application Passwords are correct in `.env`
- Ensure Application Passwords plugin is active on WordPress sites
- Check that user accounts have appropriate permissions

### API Errors

- Verify WordPress REST API is accessible
- Check that ACF REST API endpoints are enabled
- Ensure custom post types and taxonomies are registered for REST API

### Image Upload Failures

- Verify `images/` directory contains `.webp` files
- Check file permissions
- Ensure staging site has sufficient storage

## Security Notes

- Never commit `.env` file to version control
- Keep Application Passwords secure
- Use HTTPS for all WordPress sites
- Regularly rotate Application Passwords

## License

This is a custom migration tool. Modify as needed for your use case.
