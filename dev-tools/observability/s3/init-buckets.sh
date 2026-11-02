#!/bin/sh
# Buckets expected by the backend (see backend/.env.example).
for b in media miniature branding picture; do
  awslocal s3 mb "s3://$b" >/dev/null 2>&1 || true
done
