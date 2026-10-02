const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');

process.chdir(path.resolve(__dirname, '../../frontend'));
process.env.NODE_ENV = 'development';
process.env.BABEL_ENV = 'development';
process.env.BROWSER = 'none';
process.env.HOST = '127.0.0.1';
process.env.PORT = '3000';
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const paths = appRequire('react-scripts/config/paths');
const cache = path.resolve(__dirname, '../../.local-test/runner/cache/frontend');
fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
paths.appWebpackCache = path.join(cache, 'webpack');
paths.appTsBuildInfoFile = path.join(cache, 'tsconfig.tsbuildinfo');
appRequire('react-scripts/scripts/start');
