import fs from 'fs';
import flatten from 'lodash/flatten';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

// Promisify common fs functions.
export const stat = promisify(fs.stat);
export const readFile = promisify(fs.readFile);
export const writeFile = promisify(fs.writeFile);
export const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);

export function existsSync(path) {
  try {
    fs.accessSync(path);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Creates a temporary directory and returns it path.
 *
 * @returns {Promise<string>}
 */
export function createTemp() {
  return promisify(fs.mkdtemp)(`${os.tmpdir()}${path.sep}`);
}

/**
 * Ensures the given path exists.
 *  - If the path already exist, it's fine - it does nothing.
 *  - If the path doesn't exist, it will create it.
 *
 * @param {string} path
 * @returns {Promise}
 */
export function ensureDirectoryExists(dir) {
  return stat(dir).catch(() => mkdir(dir, { recursive: true }));
}

/**
 * Read a directory,
 * sorting folders and files by alphabetically order.
 * Can be browsed recursively.
 *
 * @param {string} dir
 * The directory to analyse
 *
 * @param {boolean} recursive
 * Browse directory recursively
 *
 * @returns {Promise<[string]>}
 * All found files, concatenated to the current dir
 */
export async function getFilepathsInFolder(dir, recursive = false) {
  const pathsList = await readdir(dir);
  return flatten(
    await Promise.all(
      pathsList.sort().map(async (currentPath) => {
        const currentFile = path.resolve(dir, currentPath);
        const statFile = await stat(currentFile);
        if (statFile && statFile.isDirectory()) {
          if (recursive) {
            return await getFilepathsInFolder(currentFile, true);
          }
          return [];
        }
        return [currentFile];
      })
    )
  );
}

