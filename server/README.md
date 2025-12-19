Karakara Gallery Server
======================

This small Express server lists images from a Google Drive folder and proxies image bytes to the browser so your static site can show Drive images without exposing Drive credentials.

Quick overview
- `GET /api/images` — returns JSON array of images for the configured folder. Each item: `{id,name,mimeType,url,thumb}`. `url` points to `/api/image/:id` on this server.
- `GET /api/image/:id` — streams the raw image bytes from Drive (proxied by the server).
- `POST /api/upload` — optional upload endpoint (multipart/form-data field `image`) that uploads the file to the configured Drive folder. Enabled when `ENABLE_UPLOAD=true`.

Setup
1. Create a Google Cloud Service Account and download the service account JSON. Give it the `Drive API` access (enable Drive API) and ensure it has permission to access the target folder. The simplest approach is to share the folder with the service account's email address.
2. Copy `.env.example` to `.env` and set values:

   - `SERVICE_ACCOUNT_JSON` — (OPTION A) paste the whole service account JSON string (careful with newlines), or
   - `GOOGLE_APPLICATION_CREDENTIALS` — (OPTION B) path to the downloaded JSON file, e.g. `./service-account.json`
   - `DRIVE_FOLDER_ID` — the Drive folder ID to read images from.
   - `PORT` — server port (default 3000)
   - `ENABLE_UPLOAD` — `true` to enable `/api/upload`.

Example .env (minimal):

```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
DRIVE_FOLDER_ID=12Ksg3saeVQxY9uKL3i8eM3XqjdE-qsvm
PORT=3000
ENABLE_UPLOAD=true
```

Run
```
cd server
npm install
npm start
```

Notes
- The service account must have at least read access to the target folder. Sharing the folder with the service account's email address is easiest.
- This proxy approach avoids exposing Drive credentials or requiring public file sharing. The server streams images to the browser.
- If you prefer making files public, you can instead use direct Drive URLs in the frontend: `https://drive.google.com/uc?export=view&id=FILE_ID` — but those require the file to be shared publicly.

Security
- This server is a minimal example. For production, add authentication on the upload endpoint, rate-limiting, caching headers, and proper error handling.
