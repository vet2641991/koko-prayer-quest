// Metro: also bundle the shared lesson schema from ../packages/shared (one schema for the admin, scripts and app).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.resolve(projectRoot, '../packages/shared')];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
module.exports = config;
