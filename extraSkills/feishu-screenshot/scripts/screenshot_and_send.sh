#!/bin/bash
# Example: Capture screenshot and prepare for Feishu
# Usage: ./screenshot_and_send.sh
#
# Note: This script captures the screenshot. Use the message tool to send it.

# Generate unique filename
TIMESTAMP=$(date +%s)
SCREENSHOT_PATH="${TMPDIR%/}/screenshot_${TIMESTAMP}.png"

# Capture screenshot (silent, no sound)
screencapture -x "$SCREENSHOT_PATH"

# Check if capture succeeded
if [ -f "$SCREENSHOT_PATH" ]; then
    echo "Screenshot saved to: $SCREENSHOT_PATH"
    echo ""
    echo "To send to Feishu, use message tool:"
    echo "  message(action=send, media=\"$SCREENSHOT_PATH\", channel=\"feishu\")"
else
    echo "Failed to capture screenshot"
    exit 1
fi
