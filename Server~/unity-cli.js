#!/usr/bin/env node

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';

const COMMANDS = ['execute_menu_item', 'get_menu_items', 'get_logs', 'get_warn_error_logs', 'recompile_scripts'];
const WARN_ERROR_TYPES = new Set(['Warning', 'Error', 'Exception', 'Assert']);
const DEFAULT_PORT = 8090;
const DEFAULT_HOST = 'localhost';
const DEFAULT_TIMEOUT = 10000;
const RECOMPILE_TIMEOUT = 60000;

// --- Arg parsing ---

function parseArgs(argv) {
  const command = argv[2];
  if (!command || !COMMANDS.includes(command)) {
    printUsage();
    process.exit(1);
  }

  const params = {};
  const rest = argv.slice(3);
  let timeout = null;

  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const val = rest[i + 1];
    if (!key?.startsWith('--') || val === undefined) {
      process.stderr.write(`Invalid argument: ${key}\n`);
      process.exit(1);
    }
    const name = key.slice(2);
    if (name === 'timeout') {
      timeout = Number(val);
      continue;
    }
    params[name] = coerce(val);
  }

  return { command, params, timeout };
}

function coerce(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val.trim() !== '') return num;
  return val;
}

function printUsage() {
  process.stderr.write(
`Usage: unity-cli <command> [--key value ...] [--timeout <ms>]

  execute_menu_item  --menuPath <path>          unity-cli execute_menu_item --menuPath "Assets/Refresh"
  get_menu_items                                unity-cli get_menu_items | grep Tools/
  get_logs           [--limit] [--offset]       unity-cli get_logs --limit 100
  get_warn_error_logs  (same as get_logs)       unity-cli get_warn_error_logs
  recompile_scripts  [--returnWithLogs]         unity-cli recompile_scripts
                     [--logsLimit 0-1000]
`
  );
}

// --- Config ---

async function readConfig() {
  const candidates = [
    path.resolve(process.cwd(), '../ProjectSettings/McpUnitySettings.json'),
    path.resolve(process.cwd(), 'ProjectSettings/McpUnitySettings.json'),
  ];

  for (const configPath of candidates) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // try next
    }
  }
  return {};
}

async function getConnectionInfo() {
  const config = await readConfig();
  const port = config.Port ? parseInt(config.Port, 10) : DEFAULT_PORT;
  const host = process.env.UNITY_HOST || config.Host || DEFAULT_HOST;
  return { host, port };
}

// --- WebSocket request ---

function sendRequest(host, port, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}/McpUnity`;
    const ws = new WebSocket(url);
    const id = uuidv4();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.on('message', (data) => {
      if (settled) return;
      try {
        const response = JSON.parse(data.toString());
        if (response.id !== id) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (response.error) {
          reject(new Error(response.error.message || 'Unity error'));
        } else {
          resolve(response.result);
        }
      } catch (e) {
        // ignore parse errors for non-matching messages
      }
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(err.message || `Cannot connect to Unity at ${url}`));
      }
    });

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('WebSocket closed before response'));
      }
    });
  });
}

// --- Main ---

async function main() {
  const { command, params, timeout } = parseArgs(process.argv);
  const { host, port } = await getConnectionInfo();

  const filterWarnError = command === 'get_warn_error_logs';
  const method = (command === 'get_logs' || filterWarnError) ? 'get_console_logs' : command;

  const defaultTimeout = command === 'recompile_scripts' ? RECOMPILE_TIMEOUT : DEFAULT_TIMEOUT;
  const timeoutMs = timeout ?? defaultTimeout;

  try {
    let result = await sendRequest(host, port, method, params, timeoutMs);

    if (filterWarnError && result?.logs) {
      result.logs = result.logs.filter(log => WARN_ERROR_TYPES.has(log.type));
    }

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: true, message: err.message }) + '\n');
    process.exit(1);
  }
}

main();
