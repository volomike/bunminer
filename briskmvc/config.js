import fs from 'fs';
import path from 'path';
import Hjson from 'hjson';  // Make sure this is installed: bun add hjson

export function loadConfig({ BASEPATH }) {
  const configPath = path.join(BASEPATH, 'config', 'config.js');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at: ${configPath}`);
  }

  const rawContent = fs.readFileSync(configPath, 'utf-8');

  try {
    // Parse as HJSON (allows unquoted keys, comments, trailing commas, etc.)
    const config = Hjson.parse(rawContent);
    return config;
  } catch (parseErr) {
    throw new Error(
      `Failed to parse HJSON config file:\n` +
      `Path: ${configPath}\n` +
      `Error: ${parseErr.message}\n` +
      `Raw content preview: ${rawContent.slice(0, 200)}...`
    );
  }
}
