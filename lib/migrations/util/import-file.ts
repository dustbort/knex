import isModuleType from './is-module-type';

/**
 * imports 'mjs', else requires.
 * NOTE: require me late!
 * @param {string} filepath
 */
export default async function importFile(filepath) {
  return (await isModuleType(filepath))
    ? import(require('url').pathToFileURL(filepath))
    : require(filepath);
};
