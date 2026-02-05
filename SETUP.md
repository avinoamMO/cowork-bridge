# Setup Guide

Step-by-step instructions to get Cowork Bridge running. The hardest part is patching Claude Desktop to enable CDP — this guide covers every gotcha.

---

## 1. Install the bridge

```bash
git clone https://github.com/avinoamMO/cowork-bridge.git
cd cowork-bridge
npm install
```

---

## 2. Patch Claude Desktop for CDP

Claude Desktop is an Electron app. We need to enable Chrome DevTools Protocol (CDP) on port 9222 so Puppeteer can connect to it. This requires modifying the app and re-signing it.

**We'll create a separate copy** so your regular Claude.app stays untouched.

### 2.1 Copy the app (strip macOS provenance)

Regular `cp -R` preserves the `com.apple.provenance` extended attribute, which blocks modifications even on the copy. Use tar to strip it:

```bash
cd /Applications
tar cf - --no-xattrs Claude.app | (cd ~/; tar xf -)
mv ~/Claude.app ~/Claude-Debug.app
```

### 2.2 Install asar tool

```bash
npm install -g @electron/asar
```

### 2.3 Extract app.asar

```bash
mkdir /tmp/claude-asar-extract
asar extract ~/Claude-Debug.app/Contents/Resources/app.asar /tmp/claude-asar-extract
```

### 2.4 Find the main entry point

The entry point varies by Claude version. Look for it:

```bash
# Check package.json for the main field
cat /tmp/claude-asar-extract/package.json | grep main
```

As of early 2026, the entry point is `.vite/build/index.pre.js`. Verify it exists:

```bash
ls /tmp/claude-asar-extract/.vite/build/index.pre.js
```

### 2.5 Inject CDP flag

Prepend the CDP switch to the entry point file:

```bash
cd /tmp/claude-asar-extract

# Backup original
cp .vite/build/index.pre.js .vite/build/index.pre.js.bak

# Prepend the CDP flag
echo 'require("electron").app.commandLine.appendSwitch("remote-debugging-port","9222");' | \
  cat - .vite/build/index.pre.js.bak > .vite/build/index.pre.js
```

### 2.6 Repack the asar

```bash
asar pack /tmp/claude-asar-extract /tmp/claude-app-modified.asar

# Replace the original
cp /tmp/claude-app-modified.asar ~/Claude-Debug.app/Contents/Resources/app.asar
```

### 2.7 Update the ASAR integrity hash

Electron verifies a SHA256 hash stored in `Info.plist` under the `ElectronAsarIntegrity` key. If it doesn't match, the app crashes on launch.

**Important**: Electron computes the hash differently than `shasum`. You can't just run `shasum -a 256` — the values won't match.

The easiest approach is to **let Electron tell you the correct hash**:

```bash
# Try to launch — it will fail with a hash mismatch error
~/Claude-Debug.app/Contents/MacOS/Claude 2>&1 | grep -i hash
```

Look for output like:
```
FATAL:asar_util.cc Expected hash: abc123... Actual hash: def456...
```

The "Actual hash" is the one you need. Copy it.

Now update Info.plist:

```bash
python3 -c "
import plistlib, sys

plist_path = '$HOME/Claude-Debug.app/Contents/Info.plist'
with open(plist_path, 'rb') as f:
    plist = plistlib.load(f)

# Replace with the actual hash from the error message
new_hash = 'PASTE_THE_ACTUAL_HASH_HERE'
plist['ElectronAsarIntegrity']['Resources/app.asar']['hash'] = new_hash

with open(plist_path, 'wb') as f:
    plistlib.dump(plist, f)

print('Updated hash to:', new_hash)
"
```

### 2.8 Extract entitlements from original Claude.app

Claude Desktop needs specific entitlements to function (especially `com.apple.security.virtualization` for Cowork's VM sandbox):

```bash
codesign -d --entitlements - --xml /Applications/Claude.app > /tmp/claude-entitlements.xml 2>/dev/null
```

### 2.9 Re-sign the patched app

```bash
codesign --force --deep --sign - \
  --entitlements /tmp/claude-entitlements.xml \
  ~/Claude-Debug.app
```

### 2.10 Verify

```bash
# Launch the patched app
open ~/Claude-Debug.app

# Wait a few seconds for it to start
sleep 5

# Test CDP
curl -s http://127.0.0.1:9222/json/version
```

You should get a JSON response with the Electron/Chrome version. If you get "Connection refused", CDP isn't enabled — retrace the steps.

---

## 3. Start the bridge

```bash
cd ~/cowork-bridge
node bridge.js
```

Expected output:
```
==================================================
COWORK BRIDGE - Starting
==================================================

Configuration:
  Claude Path: /Users/you/Claude-Debug.app/Contents/MacOS/Claude
  HTTP Port:   7777
  CDP Port:    9222
  ...

CDP already available
Connecting via Puppeteer...
Found 3 page(s)
Main page: "Claude" [https://claude.ai/...]

==================================================
BRIDGE READY
==================================================
```

### Verify it works

```bash
# Health check
curl -s http://localhost:7777/status | jq .

# Read what's on screen
curl -s http://localhost:7777/text
```

---

## 4. Optional: tmux notifications

If you run Claude Code in tmux, the bridge can notify your terminal when Cowork sends a message:

```bash
# Start a tmux session named 'claude'
tmux new -s claude

# Run the bridge in another pane or window
node ~/cowork-bridge/bridge.js
```

The bridge auto-detects tmux sessions containing "claude" in the name.

To disable: `ENABLE_TMUX_NOTIFY=false node bridge.js`

---

## Troubleshooting

### "Port 7777 already in use"
```bash
lsof -ti:7777 | xargs kill -9
node bridge.js
```

### App crashes on launch
The ASAR integrity hash is wrong. Re-do step 2.7.

### "Connection refused" on port 9222
CDP isn't enabled. Verify the injection in step 2.5 is at the very top of the entry file.

### App launches but Cowork workspace shows error
Missing entitlements. Re-do steps 2.8 and 2.9 — make sure you extracted entitlements from the **original** `/Applications/Claude.app`.

### Puppeteer can't connect
Make sure you're using `puppeteer-core` (not full puppeteer). The bridge does this already if you ran `npm install`.

### App says "already the latest version" and exits
This happens if you try to launch the binary directly while another Claude instance is running. Quit the other Claude first, or use `open ~/Claude-Debug.app`.

### After a Claude update, the patch breaks
You'll need to redo the patching process (steps 2.1 through 2.9) since the app.asar changes with each update.

---

## Environment variables

All optional — defaults work out of the box:

| Variable | Default | What it does |
|----------|---------|-------------|
| `CLAUDE_PATH` | `~/Claude-Debug.app/Contents/MacOS/Claude` | Path to patched Claude binary |
| `HTTP_PORT` | `7777` | Bridge API port |
| `CDP_PORT` | `9222` | Chrome DevTools Protocol port |
| `TMUX_SESSION` | `claude` | Tmux session name for notifications |
| `ENABLE_TMUX_NOTIFY` | `true` | Set to `false` to disable tmux |
| `CDP_TIMEOUT` | `30` | Seconds to wait for CDP on startup |

```bash
# Example: custom ports
HTTP_PORT=8888 CDP_PORT=9223 node bridge.js
```
