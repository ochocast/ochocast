# POC - Ubicast Videos Migration - Scaleway

This script allows you to retrieve videos from the Ubicast platform and store them on Scaleway using AWS S3. It also saves video metadata in the project's PostgreSQL database.

## Features

- Connection to the Ubicast API to retrieve videos.
- Storage of videos on Scaleway via AWS S3.
- Recording of video metadata in the project's PostgreSQL database.
- Video search can be done in two ways:
  - Loading video identifiers (`oids`) from a CSV file.
  - Exhaustive video search by browsing various search terms.

---

# Installation and Execution

## Installing Dependencies

Before running the script, install the necessary dependencies with the command:

```sh
npm install
```

## Running the Script

Run the script with the following command:

```sh
node downloadOctoVideo.js
```

## Configuration

The script uses several environment variables to store sensitive information:

### Main Features

- Video retrieval (two methods, to see which is most efficient):

  - By direct request via their identifiers (`oids`).
  - By exhaustive search on the UbiCast API (currently commented in the code).

- Download and upload:

  - Downloading videos from the UbiCast API.
  - Upload to a Scaleway S3 bucket.

- Database:
  - Connection to a PostgreSQL database.
  - Insertion of video metadata.

## Improvements to Implement (TODO)

- Integrate UbiCast thumbnails into the database.
- Retrieve and store UbiCast thumbnails on Scaleway.
- Improve video search (via API Search or Excel file).
- Automate the retrieval of all UbiCast videos.

## Configuration

### 1. **Connection Variables**

| Variable        | Description                                           |
| --------------- | ----------------------------------------------------- |
| `API_KEY`       | API key to access the UbiCast API.                    |
| `API_BASE_URL`  | UbiCast API URL.                                      |
| `BUCKET_NAME`   | Name of the Scaleway bucket where videos will be stored. |
| `REGION`        | Scaleway service region.                              |
| `S3_ACCESS_KEY` | Scaleway S3 access key.                               |
| `S3_SECRET_KEY` | Scaleway S3 secret key.                               |

Sensitive variable values must be configured in the .env file or environment secrets.

### 2. **PostgreSQL Database**

| Parameter  | Value               |
| ---------- | ------------------- |
| `user`     | `octocast-db-prod`  |
| `host`     | `51.159.205.159`    |
| `database` | `rdb`               |
| `password` | Password required   |
| `port`     | `5253`              |

## Detailed Operation

1. **Database Connection and Closure**

   - `connectDatabase()`: Establishes the PostgreSQL connection.
   - `closeDatabase()`: Closes the PostgreSQL connection.

2. **Loading Videos**

   - `loadOidsFromCsv(filePath)`: Loads a list of identifiers (oids) from a CSV file extracted from Ubicast, containing all information about hosted videos.
   - `fetchAllVideosExhaustively()`: Retrieves all videos from their `oids`.

3. **Retrieving Videos**

   - `fetchVideoDetails(oid)`: Retrieves complete metadata for a video.
   - `fetchVideosWithSearch(searchTerm)`: Performs a video search by keyword.

4. **Processing Videos**

   - `addUniqueVideos(videos)`: Adds videos to the list ensuring there are no duplicates.
   - `processVideo(video)`: Downloads, uploads, and saves a video to the database.

5. **Complete Migration**

   - `migrateVideos()`: Orchestrates the entire process.

## Error Handling

The script includes several error handling mechanisms:

- Verification of API and database connections.
- Verification of HTTP status of API requests.
- Upload error handling with progress tracking.
- Verification and management of conflicts during database insertion.

## Performance Tracking

At the end of script execution, a summary of operations is displayed:

- Number of videos added to the database.
- Number of videos uploaded to Scaleway.
- Number of migration failures.

## Execution and Logs

The script displays detailed logs to track progress:

- Database connection successful.
- Search with term: "A"
- Downloading video: example.mp4
- Uploading video to Scaleway: example.mp4
- Video "example.mp4" uploaded successfully.
- Video "example.mp4" inserted into database.
- Migration completed!
- Total number of videos added to database: 42
- Total number of videos uploaded to Scaleway bucket: 38
- Total number of failed videos: 4

# Author

- Developer(s): Oriane Margelisch
- Last update: 2024-01-29
