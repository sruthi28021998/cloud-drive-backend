# Cloud Drive — Backend

A REST API for a cloud-based media file storage and sharing service (Google Drive-style clone). Built with Node.js, Express, PostgreSQL (via Supabase), and Supabase Storage.

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (hosted on Supabase)
- **File Storage:** Supabase Storage (signed upload/download URLs)
- **Auth:** JWT (access + refresh tokens) with bcrypt password hashing
- **Validation:** Zod

## Project Structure

```
src/
  config/         # Database and Supabase client setup
  controllers/    # Route handler logic
  middleware/     # Auth, error handling, rate limiting
  routes/         # Express route definitions
  scripts/        # One-off scripts (e.g. connection test)
  utils/          # Shared helpers (tokens, access control, cascade delete, activity log)
  app.js          # Express app setup
  server.js       # Entry point
```

## Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default `8080`) |
| `NODE_ENV` | `development` or `production` — controls cookie security settings |
| `DATABASE_URL` | Postgres connection string (use the **Transaction pooler** URI from Supabase for IPv4 compatibility) |
| `JWT_SECRET` | Secret for signing short-lived access tokens |
| `REFRESH_SECRET` | Secret for signing longer-lived refresh tokens |
| `CORS_ORIGIN` | The frontend's URL, for CORS + cookie handling |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS — backend enforces access control itself) |
| `SUPABASE_STORAGE_BUCKET` | Name of the Storage bucket used for files (e.g. `drive`) |

## Setup

```bash
npm install
node src/scripts/testConnection.js   # verify DB + Storage connectivity
npm run dev                          # start with nodemon (auto-restart)
npm start                            # start without nodemon (production)
```

## Database Schema

Tables: `users`, `folders`, `files`, `file_versions`, `shares`, `link_shares`, `stars`, `activities`. See the SQL setup run in Supabase's SQL Editor for full definitions. Row Level Security is disabled — all access control is enforced in application code (see `utils/access.js`).

## API Reference

All endpoints are prefixed with `/api`. Authenticated routes read the JWT from an httpOnly cookie (`accessToken`).

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create an account (email, password, name). Sets session cookies. |
| POST | `/login` | Log in with email + password. Sets session cookies. |
| POST | `/logout` | Clears session cookies. |
| POST | `/refresh` | Issues a new access token using the refresh token cookie. |
| GET | `/me` | Returns the current logged-in user's profile. |
| GET | `/lookup?email=` | Looks up a user's id/name by email (used to add them as a share recipient). |

### Folders (`/api/folders`)
| Method | Path | Description |
|---|---|---|
| GET | `/root` | List folders/files at the root level (no parent). |
| POST | `/` | Create a folder (`name`, optional `parentId`). |
| GET | `/:id` | Get a folder's contents, breadcrumb path, and your access level. |
| PATCH | `/:id` | Rename or move a folder (`name` and/or `parentId`). |
| DELETE | `/:id` | Soft-delete a folder and cascade to its entire subtree (subfolders + files). |

### Files (`/api/files`)
| Method | Path | Description |
|---|---|---|
| POST | `/init` | Start an upload — validates type/size, creates a DB row, returns a signed upload URL. |
| POST | `/complete` | Finalize an upload after the file was PUT to the signed URL. |
| GET | `/:id` | Get file metadata + a signed download URL (5 min expiry). |
| PATCH | `/:id` | Rename or move a file (`name` and/or `folderId`). |
| DELETE | `/:id` | Soft-delete a file (moves to trash). |
| POST | `/:id/versions/init` | Start uploading a new version of an existing file. |
| POST | `/:id/versions/complete` | Finalize a new version upload; archives the previous content. |
| GET | `/:id/versions` | List all versions of a file, with the current version flagged. |
| POST | `/:id/versions/:versionId/revert` | Revert the file's current content to an older version. |

**Allowed file types:** PNG, JPEG, WebP, GIF, PDF, plain text, Word (.docx), Excel (.xlsx), generic binary, and ZIP. Max size: 500MB (also subject to your Supabase Storage plan's per-file limit).

### Sharing (`/api/shares`)
| Method | Path | Auth required? | Description |
|---|---|---|---|
| POST | `/` | Yes | Share a file/folder with another user by their user id, as `viewer` or `editor`. |
| GET | `/:resourceType/:resourceId` | Yes | List everyone a resource is shared with. |
| DELETE | `/:id` | Yes | Revoke a share. |
| POST | `/link` | Yes | Create a public link, with optional `expiresAt` and `password`. |
| GET | `/link/:token` | No | Resolve a public link — returns resource metadata. Validates expiry/password. |
| GET | `/link/:token/download` | No | Get a signed download URL for a publicly-shared file. |
| DELETE | `/link/:id` | Yes | Delete a public link. |

### Search, Stars, Trash, Activity (`/api`)
| Method | Path | Description |
|---|---|---|
| GET | `/search?q=&type=&sort=&starred=` | Search your files by name (partial match), optionally filtered by MIME type, sorted by `name` / `date` / `size`, or filtered to only starred files. |
| POST | `/stars` | Star a file/folder (`resourceType`, `resourceId`). |
| DELETE | `/stars` | Unstar a file/folder. |
| GET | `/trash` | List everything currently in trash. |
| POST | `/trash/restore` | Restore a file or folder from trash (folders restore their entire subtree). |
| GET | `/activity` | Get your 50 most recent actions (uploads, renames, deletes, shares, etc.). |

## Access Control Model

Every folder/file has one **owner**. Owners can grant other users `viewer` (read-only) or `editor` (can rename/move/delete) access via the shares system. Access checks run on every protected operation — see `utils/access.js`'s `getAccessLevel()`.

## Deployment

Deployed on **Render** (free tier):

1. Push the repo to GitHub.
2. Render → New + → Web Service → connect this repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Add all environment variables listed above, with `NODE_ENV=production`.
5. Once the frontend is deployed too, set `CORS_ORIGIN` to the frontend's live URL (exact match, no trailing slash).

**Note:** Render's free tier spins the server down after ~15 minutes of inactivity. The first request after that can take 30–60 seconds to respond while it wakes back up — this is expected, not a bug. Visiting `/` or `/api/health` is an easy way to "warm up" the server before a demo.

## Known Limitations

- No automated tests (manual testing only).
- No Google/OAuth login — email + password only.
- Large file uploads (e.g. very large ZIPs) may be limited by your Supabase Storage plan's per-file size cap.
- Folder uploads (dragging an entire OS folder with its structure) are not supported — only individual files.
- No full-text search or pagination — search is a simple partial-name match capped at 100 results.
- Bonus-tier features (payments/Stripe, real-time collaboration via WebSockets, a native mobile/desktop app) were intentionally not attempted — each is a substantial standalone effort beyond this project's scope and timeline.