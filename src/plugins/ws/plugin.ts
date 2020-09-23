import * as WEBSOCKETS from 'ws';
import * as os from 'os';
import { IEmitter, PluginFeature } from '@bettercorp/service-base/lib/ILib';
import { Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { WSEvent } from './WSEvent';

let WebSocket: WEBSOCKETS;
let reconnect = (features: PluginFeature) => {
  features.log.info(`[WS] Connect to[${features.config.plugins.ws.endpoint}]`);
  WebSocket = new WEBSOCKETS(features.config.plugins.ws.endpoint, {
    perMessageDeflate: false
  });
  WebSocket.on('error', function () {
    features.log.info('[WS] Errored out');
    features.emitEvent(`ws-status`, false);
  });
  WebSocket.on('close', function () {
    features.log.info('[WS] Disconnected');
    features.emitEvent(`ws-status`, false);
    WebSocket.close();
    WebSocket.terminate();
    setTimeout(() => {
      reconnect(features);
    }, 5000);
  });
  WebSocket.on('open', function open () {
    features.log.info('[WS] Connected');
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
    let msg: WSEvent = JSON.parse(data);
    if (msg.action === 'log') {
      return features.log.info(`[SERVER-${msg.action}] ${msg.data}`);
    }
    features.log.info(data);
    if (TOOLS.isNullOrUndefined(msg.action)) return;
    if (TOOLS.isNullOrUndefined(msg.data)) return;
    features.emitEvent('message', false, msg);
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

  features.onEvent('send', false, (data: IEmitter<WSEvent>) => {
    if (TOOLS.isNullOrUndefined(data.data)) return;
    if (TOOLS.isNullOrUndefined(data.data.action)) return;
    if (typeof data.data.action !== 'string') return;

    if (WebSocket === undefined || WebSocket === null) {
      return features.log.warn('WS NOT CONNECTED YET');
    }
    try {
      WebSocket.send(JSON.stringify({
        action: data.data.action,
        data: data.data.data,
        auth: features.config.plugins.ws.token || '',
      }));
    } catch (exc) {
      features.log.error(exc);
    }
  });
};