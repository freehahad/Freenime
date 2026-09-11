# freenime 2.0

A simple self-hosted video streaming site with optional Cloudflare R2 object storage.

## Why this version is upgraded

Render Free has an ephemeral filesystem, so uploaded files saved only on the Render service can disappear after a restart, spin-down, or redeploy. This version can store uploaded videos and posters in Cloudflare R2 instead. citeturn0search2turn0search1

R2 exposes an S3-compatible API, so the Node app uploads files directly to your bucket. Multipart uploads are used for large files. citeturn0search0turn0search7

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Set `ADMIN_KEY`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

If you do not configure R2, the site uses local storage. That is fine for local testing, but it is not persistent on Render Free.

## Render + Cloudflare R2 setup

Create an R2 bucket and an API token with Object Read & Write permission for that bucket. Keep the access key and secret private. citeturn0search0

Add these Render environment variables:

- `ADMIN_KEY` = your private admin key
- `R2_ENDPOINT` = `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`
- `R2_BUCKET` = your bucket name
- `R2_ACCESS_KEY_ID` = your R2 access key
- `R2_SECRET_ACCESS_KEY` = your R2 secret key
- `R2_PUBLIC_URL` = the public URL/domain that serves your R2 objects

The R2 endpoint format and S3 credentials are documented by Cloudflare. citeturn0search0

### Important: public video URLs

The app returns direct R2 URLs for the video player. Your R2 bucket needs a public/custom-domain URL configured for the objects. Do not put R2 secret credentials in GitHub or in frontend JavaScript.

## Uploading

Open `/admin.html`, enter the admin key, choose a video, optionally choose a poster, and upload.

Large videos use S3 multipart upload through the AWS SDK for JavaScript. Cloudflare recommends multipart uploads for large files such as video. citeturn0search7

## GitHub

Upload the project files, but never upload:

- `node_modules/`
- `.env`
- R2 access keys or secret keys
- private admin keys
- copyrighted/downloaded videos you do not have permission to distribute

## Content

Only upload videos you own or have permission/licensing to distribute.
