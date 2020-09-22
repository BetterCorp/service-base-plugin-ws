import * as WEBSOCKETS from 'ws';
import * as os from 'os';
import { PluginFeature } from '@bettercorp/service-base/lib/ILib';
import { Tools as TOOLS } from '@bettercorp/tools/lib/Tools';

let WebSocket: WEBSOCKETS;
let reconnect = (features: PluginFeature) => {
  console.log(`[WS] Connect to[${features.config.plugins.ws.endpoint}]`);
  WebSocket = new WEBSOCKETS(features.config.plugins.ws.endpoint, {
    perMessageDeflate: false
  });
  WebSocket.on('error', function () {
    console.log('[WS] Errored out');
    features.emitEvent(`ws-status`, false);
  });
  WebSocket.on('close', function () {
    console.log('[WS] Disconnected');
    features.emitEvent(`ws-status`, false);
    WebSocket.close();
    WebSocket.terminate();
    setTimeout(() => {
      reconnect(features);
    }, 5000);
  });
  WebSocket.on('open', function open () {
    console.log('[WS] Connected');
    WebSocket.send(JSON.stringify({
      action: 'ws-auth',
      auth: features.config.plugins.ws.token || '',
      data: {
        name: features.config.identity || features.config.plugins.ws.identity || os.hostname
      }
    }));
    setTimeout(() => {
      features.emitEvent(`ws-status`, true);
    }, 5000);
  });

  WebSocket.on('message', function incoming (data: string) {
    let msg = JSON.parse(data);
    if (msg.action === 'log') {
      return console.log(`[SERVER] ${msg.data}`);
    }
    console.log(data);
    if (TOOLS.isNullOrUndefined(msg.action)) return;
    if (TOOLS.isNullOrUndefined(msg.data)) return;
    features.emitEvent(`ws-${msg.action}`, msg.data);
  });
};
module.exports.init = (features: PluginFeature) => {
  if (TOOLS.isNullOrUndefined(features.config.plugins)) {
    throw `No plugins definition in config file!`;
  }
  if (TOOLS.isNullOrUndefined(features.config.plugins.ws)) {
    throw `No ws plugin definition in config file!`;
  }
  if (TOOLS.isNullOrUndefined(features.config.plugins.ws.endpoint)) {
    throw `No ws plugin endpoint definition in config file!`;
  }
  if (TOOLS.isNullOrUndefined(features.config.plugins.ws.token)) {
    throw `No ws plugin token definition in config file!`;
  }

  reconnect(features);

  features.onEvent('ws-send', null, (...args: any[]) => {
    if (args.length === 0) return;
    let objectOfInfo: any = args[0];
    if (TOOLS.isNullOrUndefined(objectOfInfo.action)) return;
    if (TOOLS.isNullOrUndefined(objectOfInfo.data)) return;
    if (typeof objectOfInfo.action !== 'string') return;

    if (WebSocket === undefined || WebSocket === null) {
      return console.warn('WS NOT CONNECTED YET');
    }
    try {
      WebSocket.send(JSON.stringify({
        action: objectOfInfo.action,
        data: objectOfInfo.data,
        auth: (features.config.identity || {}).token || '',
      }));
    } catch (exc) {
      console.error(exc);
    }
  }, true);
};