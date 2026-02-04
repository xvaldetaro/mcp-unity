# Unity CLI

A lightweight CLI that talks to Unity Editor over WebSocket. Supports executing menu items, reading console logs, and triggering script recompilation.

## Setup

### 1. Install the Unity package

1. Open Unity Package Manager (Window > Package Manager)
2. Click "+" > "Add package from git URL..."
3. Enter: `https://github.com/CoderGamester/mcp-unity.git`
4. Open Tools > MCP Unity > Server Window and click "Start Server"

This runs a WebSocket server inside Unity on port 8090.

### 2. Install the CLI

```bash
cd <your-unity-project>/Packages/com.mcp.unity/Server~
npm install
npm link
```

`unity-cli` is now available globally.

## Commands

```bash
# Execute any Unity menu item
unity-cli execute_menu_item --menuPath "Assets/Refresh"
unity-cli execute_menu_item --menuPath "File/Save Project"

# List available menu items (pipe to grep to search)
unity-cli get_menu_items
unity-cli get_menu_items | grep "Assets/"

# Get console logs
unity-cli get_logs
unity-cli get_logs --limit 50 --offset 10

# Get only warnings and errors
unity-cli get_warn_error_logs

# Recompile scripts (60s timeout by default)
unity-cli recompile_scripts
unity-cli recompile_scripts --returnWithLogs true --logsLimit 100
```

All commands accept `--timeout <ms>` to override the default (10s, or 60s for recompile).

Output is JSON to stdout. Exit code 0 on success, 1 on error.

## Configuration

The CLI reads `ProjectSettings/McpUnitySettings.json` for port and host. Defaults to `localhost:8090`. Set `UNITY_HOST` env var to override the host.
