---
name: feishu-send-file
description: >
  Send files to a Feishu group or user via REST API. Use when the user
  explicitly asks to send a file, attachment, or document to a Feishu
  chat/group. Triggers: "发文件到飞书", "把这个文件发到群里",
  "send file to feishu", "发个附件".
  NOT for: sending text messages (use message tool), sending images/screenshots
  (use feishu-screenshot skill), or reading documents (use feishu-doc skill).
---

# Feishu Send File

Send files to Feishu chats via REST API (bypasses the built-in message tool limitation for file messages).

## Steps

### 1. Get tenant_access_token

```python
import json, os, requests

config_path = os.path.expanduser('~/.openclaw-autoclaw/openclaw.json')
with open(config_path) as f:
    cfg = json.load(f)

feishu = cfg['channels']['feishu']
r = requests.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    json={'app_id': feishu['appId'], 'app_secret': feishu['appSecret']}
)
token = r.json()['tenant_access_token']
```

### 2. Upload the file

```python
with open('/path/to/your/file', 'rb') as f:
    r2 = requests.post(
        'https://open.feishu.cn/open-apis/im/v1/files',
        headers={'Authorization': f'Bearer {token}'},
        data={'file_type': 'stream', 'file_name': 'filename.ext'},
        files={'file': ('filename.ext', f, 'application/octet-stream')}
    )
file_key = r2.json()['data']['file_key']
```

Supported `file_type` values: `opus`, `mp4`, `pdf`, `doc`, `xls`, `ppt`, `stream` (generic)

### 3. Send file message to chat

```python
chat_id = 'oc_xxxx'  # target chat_id

r3 = requests.post(
    'https://open.feishu.cn/open-apis/im/v1/messages',
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    params={'receive_id_type': 'chat_id'},
    json={
        'receive_id': chat_id,
        'msg_type': 'file',
        'content': json.dumps({'file_key': file_key})
    }
)
print(r3.json())
```

## Notes

- The bot can only download files it **uploaded itself** (`234008` error otherwise)
- Images use a different endpoint: `POST /im/v1/images` with `image_type=message`
- To send an image message, use `msg_type: image` and `content: {"image_key": "..."}`
- Required scope: `im:message:send_as_bot`, `im:resource`

## References

- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/file/create
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create
