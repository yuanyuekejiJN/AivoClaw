---
name: feishu-screenshot
description: >
  Capture macOS screenshots and send to Feishu. Use when the user asks to
  take a screenshot and share it via Feishu. Triggers: "截个屏发飞书",
  "截屏", "screenshot", "take a screenshot and send".
  NOT for: sending existing files (use feishu-send-file skill),
  or sending text messages (use message tool).
---

# Feishu Screenshot

Capture macOS screenshots and send to Feishu conversations.

## Quick Start

```bash
# 1. Capture screenshot to temp directory
screencapture -x "$TMPDIR/screenshot.png"

# 2. Send to Feishu
# Use message tool with media parameter
```

## Sending Images to Feishu

Use the `message` tool with `media` parameter (NOT base64):

```
message(action=send, media="/path/to/image.png", channel="feishu")
```

Or reply to current conversation (auto-inferred target):
```
message(action=send, media="/path/to/image.png")
```

OpenClaw handles:
1. Upload image via `POST /open-apis/im/v1/images` -> get `image_key`
2. Send message with `msg_type: image` and the key

## Important Notes

**Use `$TMPDIR` not `/tmp`**
- macOS temp directory: `/var/folders/.../T`
- OpenClaw file access restricts to `os.tmpdir()` and workspace
- `/tmp` may not be accessible

**Use `media` parameter**
- Pass file path directly to `media` parameter
- Do NOT use `buffer` (base64) parameter
- Let OpenClaw handle the upload flow

## Full Example

Taking a screenshot and sending to Feishu:

```bash
# Capture
SCREENSHOT_PATH="$TMPDIR/screenshot_$(date +%s).png"
screencapture -x "$SCREENSHOT_PATH"
```

Then use message tool:
```
message(
  action=send,
  media="$SCREENSHOT_PATH",
  channel="feishu"
)
```

## Resources

### scripts/

- `screenshot_and_send.sh` - Example script combining capture + send
