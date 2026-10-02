const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../..');
process.chdir(path.join(root, 'backend'));
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
appRequire('dotenv').config();
appRequire('ts-node/register');
appRequire('tsconfig-paths/register');

// This test uses the existing local schema; starting it must not synchronize it.
const { DataSource } = appRequire('typeorm');
const initialize = DataSource.prototype.initialize;
DataSource.prototype.initialize = function (...args) {
  this.options.synchronize = false;
  this.options.migrationsRun = false;
  return initialize.apply(this, args);
};
appRequire(path.join(process.cwd(), 'src/main.ts'));
