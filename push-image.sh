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

# Platform selection prompt
echo "Select platform(s) to build for:"
echo "1) linux/amd64"
echo "2) linux/arm64"
echo "3) both linux/amd64,linux/arm64"
read -r -p "Enter choice [1-3]: " platform_choice

case $platform_choice in
1) PLATFORMS="linux/amd64" ;;
2) PLATFORMS="linux/arm64" ;;
# 3) PLATFORMS="linux/amd64,linux/arm64" ;;
*)
  echo "Invalid choice. Using default linux/amd64"
  PLATFORMS="linux/amd64"
  ;;
esac

echo "Building Docker image with buildx for platforms: $PLATFORMS"
echo "Tags: $TAG_VERSION and $TAG_LATEST..."

docker buildx build \
  --platform "$PLATFORMS" \
  -t "$IMAGE_NAME:$TAG_VERSION" \
  -t "$IMAGE_NAME:$TAG_LATEST" \
  --push .

echo "Docker image pushed as '$IMAGE_NAME':'$TAG_VERSION' and '$IMAGE_NAME':'$TAG_LATEST'"