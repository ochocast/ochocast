# POC - Ubicast Video Migration to Scaleway

This script fetches videos from the Ubicast platform and stores them on Scaleway using an S3-compatible API. It also records video metadata into the project's PostgreSQL database.

## Features

- Connects to the Ubicast API to fetch videos.
- Stores videos on Scaleway via S3.
- Records video metadata into the project's PostgreSQL database.
- Video discovery can be done by:
  - Loading video identifiers (`oids`) from a CSV file.
  - Exhaustive search through various search terms.

---

# Installation and execution

## Install dependencies

Before running the script, install dependencies with:

```sh
npm install
```

## Run the script

Start the script with:

```sh
node downloadOctoVideo.js
```

## Configuration

The script uses environment variables to store sensitive information.

### Main features

- Video retrieval (two methods):
  - By direct request using their identifiers (`oids`).
  - By exhaustive search via the Ubicast API (currently commented in the code).

- Download and upload:
  - Download videos from the Ubicast API.
  - Upload to a Scaleway S3 bucket.

- Database:
  - Connect to PostgreSQL.
  - Insert video metadata.

## Improvements to implement (TODO)

- Integrate Ubicast thumbnails into the database.
- Fetch and store Ubicast thumbnails on Scaleway.
- Improve video search (via API or CSV/Excel input).
- Automate the retrieval of all Ubicast videos.

## Environment variables

Expected variables:

- `API_KEY`: Ubicast API key
- `API_BASE_URL`: Ubicast API base URL
- `BUCKET_NAME`: Scaleway bucket name
- `REGION`: Scaleway region
- `S3_ACCESS_KEY` / `S3_SECRET_KEY`: Scaleway S3 credentials

Configure these in a `.env` file or via your environment secrets.

### 1. PostgreSQL connection example

| Parameter  | Value              |
| ---------- | ------------------- |
| `user`     | `octocast-db-prod`  |
| `host`     | `51.159.205.159`    |
| `database` | `rdb`               |
| `password` | password required   |
| `port`     | `5253`              |

## Detailed flow

1. **Database connect / close**
   - `connectDatabase()`: establishes the PostgreSQL connection.
   - `closeDatabase()`: closes the PostgreSQL connection.

2. **Loading videos**
   - `loadOidsFromCsv(filePath)`: loads a list of identifiers (oids) from a CSV exported from Ubicast.
   - `fetchAllVideosExhaustively()`: retrieves videos using their `oids`.

3. **Fetching video metadata**
   - `fetchVideoDetails(oid)`: fetches full metadata for a video.
   - `fetchVideosWithSearch(searchTerm)`: searches videos by keyword.

4. **Processing videos**
   - `addUniqueVideos(videos)`: adds videos ensuring no duplicates.
   - `processVideo(video)`: downloads, uploads and saves a video to the database.

5. **Full migration**
   - `migrateVideos()`: orchestrates the whole process.

## Error handling

The script includes checks for:

- API and database connectivity.
- HTTP status checks on API responses.
- Upload errors with progress tracking.
- Conflict handling when inserting into the database.

## Performance report

At the end of execution a summary is printed:

- Number of videos added to the database.
- Number of videos uploaded to Scaleway.
- Number of failed migrations.

## Execution logs

The script prints detailed logs to follow progress:

- Database connection succeeded.
- Search with term: "A"
- Downloading video: example.mp4
- Uploading video to Scaleway: example.mp4
- Video "example.mp4" uploaded successfully.
- Video "example.mp4" inserted into the database.
- Migration complete!
- Total videos added to DB: 42
- Total videos uploaded to Scaleway bucket: 38
- Total failures: 4

# Author

- Developer(s): Oriane Margelisch
- Last updated: 2024-01-29
