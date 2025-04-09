#!/bin/bash

# Script to create a source code archive without temporary files

# Set output archive name
ARCHIVE_NAME="soundvis.tar.gz"

# Print start message
echo "Creating source code archive: $ARCHIVE_NAME"

# Get the current directory name
DIR_NAME=$(basename $(pwd))

# Create tar.gz archive of the source code
# Go up one directory and tar the soundvis directory directly
# This will preserve the top-level soundvis directory in the archive
cd ..
tar --exclude="$DIR_NAME/node_modules" \
    --exclude="$DIR_NAME/.git" \
    --exclude="$DIR_NAME/dist" \
    --exclude="$DIR_NAME/build" \
    --exclude="$DIR_NAME/.cache" \
    --exclude="$DIR_NAME/*.log" \
    --exclude="$DIR_NAME/.DS_Store" \
    --exclude="$DIR_NAME/.env*" \
    --exclude="$DIR_NAME/.vscode" \
    --exclude="$DIR_NAME/.idea" \
    --exclude="$DIR_NAME/coverage" \
    --exclude="$DIR_NAME/$ARCHIVE_NAME" \
    -czvf "$DIR_NAME/$ARCHIVE_NAME" "$DIR_NAME"

# Go back to the original directory
cd "$DIR_NAME"

# Check if archive was created successfully
if [ -f "$ARCHIVE_NAME" ]; then
    echo "Archive created successfully: $ARCHIVE_NAME"
    echo "Archive size: $(du -h "$ARCHIVE_NAME" | cut -f1)"
else
    echo "Failed to create archive"
    exit 1
fi 