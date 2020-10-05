import * as WEBSOCKETS from 'ws';
import * as os from 'os';
import { IPlugin, PluginFeature } from '@bettercorp/service-base/lib/ILib';
import { Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { WSEvent } from './WSEvent';

export class Plugin implements IPlugin {
  private WebSocket!: WEBSOCKETS;
  private Features!: PluginFeature;

  private reconnect () {
    const self = this;
    self.Features.log.info(`Connect to[${self.Features.config.plugins.ws.endpoint}]`);
    self.WebSocket = new WEBSOCKETS(self.Features.config.plugins.ws.endpoint, {
      perMessageDeflate: false
    });
    self.WebSocket.on('error', function () {
      self.Features.log.info('Errored out');
      self.Features.emitEvent(null, `status`, false);
    });
    self.WebSocket.on('close', function () {
      self.Features.log.info('Disconnected');
      self.Features.emitEvent(null, `status`, false);
      self.WebSocket.close();
      self.WebSocket.terminate();
      setTimeout(() => {
        self.reconnect();
      }, 5000);
    });
    self.WebSocket.on('open', function open () {
      self.Features.log.info('Connected');
      self.WebSocket.send(JSON.stringify({
        action: 'ws-auth',
        auth: self.Features.config.plugins.ws.token || '',
        data: {
          name: self.Features.config.identity || self.Features.config.plugins.ws.identity || os.hostname
        }
      }));
      setTimeout(() => {
        self.Features.emitEvent(null, `status`, true);
      }, 5000);
    });

    self.WebSocket.on('message', function incoming (data: string) {
      let msg: WSEvent = JSON.parse(data);
      if (msg.action === 'log') {
        return self.Features.log.info(`[SERVER-${msg.action}] ${msg.data}`);
      }
      self.Features.log.info(data);
      if (TOOLS.isNullOrUndefined(msg.action)) return;
      if (TOOLS.isNullOrUndefined(msg.data)) return;
      self.Features.emitEvent(null, 'message', msg);
    });
  }

  init (features: PluginFeature): Promise<void> {
    this.Features = features;
    const self = this;
    return new Promise((resolve) => {
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

      self.reconnect();

      features.onEvent<WSEvent>(null, 'send', (data) => {
        if (TOOLS.isNullOrUndefined(data.data)) return;
        if (TOOLS.isNullOrUndefined(data.data.action)) return;
        if (typeof data.data.action !== 'string') return;

        if (WebSocket === undefined || WebSocket === null) {
          return features.log.warn('WS NOT CONNECTED YET');
        }
        try {
          self.WebSocket.send(JSON.stringify({
            action: data.data.action,
            data: data.data.data,
            auth: features.config.plugins.ws.token || '',
          }));
        } catch (exc) {
          features.log.error(exc);
        }
      });

      features.log.info("Client started")
      resolve();
    });
  }
};