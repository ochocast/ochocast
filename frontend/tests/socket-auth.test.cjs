// Run with: node --test tests/socket-auth.test.cjs (frontend dependencies installed).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
const React = require('react');
const { renderHook, cleanup } = require('@testing-library/react');
after(() => {
  cleanup();
  dom.window.close();
});

test('socket follows OIDC login and logout, re-authenticates on renewal, and allows anonymous viewing', () => {
  let auth = { isAuthenticated: false, user: null };
  const connections = [];
  const mocks = {
    react: React,
    'react-oidc-context': { useAuth: () => auth },
    'socket.io-client': {
      io(_url, options) {
        const socket = {
          connected: true,
          emitted: [],
          on() {},
          emit(event, data) {
            this.emitted.push([event, data]);
          },
          disconnect() {
            this.connected = false;
          },
        };
        connections.push({ socket, options });
        return socket;
      },
    },
    '../utils/env': { __esModule: true, default: () => 'http://localhost' },
  };
  const source = fs.readFileSync(
    path.join(__dirname, '../src/hooks/useSocket.ts'),
    'utf8',
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
      return mocks[name];
    },
    console,
    localStorage: dom.window.localStorage,
  };
  vm.runInNewContext(js, context);
  function token(index) {
    let value;
    connections[index].options.auth((result) => {
      value = result.token;
    });
    return value;
  }

  const { rerender, unmount } = renderHook(() =>
    module.exports.useSocket({ trackId: 'track-1', username: 'visitor' }),
  );
  assert.equal(connections.length, 1);
  assert.equal(token(0), undefined);
  auth = {
    isAuthenticated: true,
    user: { access_token: 'first-token', expired: false },
  };
  rerender();
  assert.equal(connections.length, 2, 'login reconnects an anonymous socket');
  assert.equal(connections[0].socket.connected, false);
  assert.equal(token(1), 'first-token');
  rerender();
  assert.equal(connections.length, 2, 'unchanged credentials do not reconnect');
  auth = {
    isAuthenticated: true,
    user: { access_token: 'new-token', expired: false },
  };
  rerender();
  assert.equal(connections.length, 2, 'token renewal keeps the open socket');
  assert.equal(connections[1].socket.connected, true);
  // The hook runs in a vm context: compare as JSON, not by prototype.
  assert.equal(
    JSON.stringify(
      connections[1].socket.emitted.filter(([e]) => e === 'authenticate'),
    ),
    JSON.stringify([['authenticate', { token: 'new-token' }]]),
    'the renewed token is sent on the open socket',
  );
  assert.equal(token(1), 'new-token', 'a reconnection sends the latest token');
  rerender();
  assert.equal(
    connections[1].socket.emitted.filter(([e]) => e === 'authenticate').length,
    1,
    'an unchanged token is not sent again',
  );
  auth = {
    isAuthenticated: true,
    user: { access_token: 'new-token', expired: true },
  };
  rerender();
  assert.equal(
    connections.length,
    3,
    'expiry removes the authenticated socket',
  );
  assert.equal(connections[1].socket.connected, false);
  assert.equal(token(2), undefined);
  auth = {
    isAuthenticated: true,
    user: { access_token: 'login-again', expired: false },
  };
  rerender();
  assert.equal(connections.length, 4);
  auth = { isAuthenticated: false, user: null };
  rerender();
  assert.equal(
    connections.length,
    5,
    'logout disconnects the authenticated socket',
  );
  assert.equal(connections[3].socket.connected, false);
  assert.equal(token(4), undefined);
  unmount();
  assert.equal(connections[4].socket.connected, false);
});
