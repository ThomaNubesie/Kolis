// Expo Metro config. Exclude the standalone Next.js admin web app (admin-web/)
// so it never collides with the mobile app bundle.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.resolver.blockList = [/[/\\]admin-web[/\\].*/];
config.watchFolders = [];

module.exports = config;
