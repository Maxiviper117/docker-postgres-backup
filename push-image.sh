#!/bin/bash
# Script to build, tag, and push Docker image to maxiviper117/pg16-backup-utility with version and latest tags

IMAGE_NAME="maxiviper117/pg16-backup-utility"
PACKAGE_JSON="package.json"

# Extract version from package.json
VERSION=$(grep '"version"' $PACKAGE_JSON | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

if [ -z "$VERSION" ]; then
  echo "Version not found in $PACKAGE_JSON. Exiting."
  exit 1
fi

TAG_LATEST="latest"
TAG_VERSION="$VERSION"

echo "Building Docker image with tags: $TAG_VERSION and $TAG_LATEST..."
docker build -t $IMAGE_NAME:$TAG_VERSION -t $IMAGE_NAME:$TAG_LATEST .

echo "Pushing Docker image with tag $TAG_VERSION..."
docker push $IMAGE_NAME:$TAG_VERSION

echo "Pushing Docker image with tag $TAG_LATEST..."
docker push $IMAGE_NAME:$TAG_LATEST

echo "Docker image pushed as $IMAGE_NAME:$TAG_VERSION and $IMAGE_NAME:$TAG_LATEST"
