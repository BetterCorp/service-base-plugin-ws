import * as WEBSOCKETS from 'ws';
import { CPlugin, CPluginClient } from '@bettercorp/service-base/lib/ILib';
import { Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { WSEvent } from './WSEvent';
import { IWSClientPluginConfig } from './sec.config';

export interface IWSclientMessage {
  action: string;
  data: any;
}

export class wsClient extends CPluginClient<IWSClientPluginConfig> {
  public readonly _pluginName: string = "ws-client";

  send(action: string, data: any) {
    this.emitEvent('send', {
      action,
      data
    });
  }

  onMessage(listener: (msg: IWSclientMessage) => void) {
    this.onEvent('message', listener);
  }

  onStatusChange(listener: (status: boolean) => void) {
    this.onEvent('status', listener);
  }
}
export class Plugin extends CPlugin<IWSClientPluginConfig> {
  private WebSocket!: WEBSOCKETS;

  private async reconnect() {
    const self = this;
    self.log.info(`Connect to[${ (await self.getPluginConfig()).endpoint }]`);
    self.WebSocket = new WEBSOCKETS((await self.getPluginConfig()).endpoint, {
      perMessageDeflate: false
    });
    self.WebSocket.on('error', function () {
      self.log.info('Errored out');
      self.emitEvent(null, `status`, false);
    });
    self.WebSocket.on('close', function () {
      self.log.info('Disconnected');
      self.emitEvent(null, `status`, false);
      self.WebSocket.close();
      self.WebSocket.terminate();
      setTimeout(() => {
        self.reconnect();
      }, 5000);
    });
    self.WebSocket.on('open', async () => {
      self.log.info('Connected');
      self.WebSocket.send(JSON.stringify({
        action: 'ws-auth',
        auth: (await self.getPluginConfig()).token,
        data: {
          name: (await self.getPluginConfig()).identity
        }
      }));
      setTimeout(async () => {
        await self.emitEvent(null, `status`, true);
      }, 5000);
    });

    self.WebSocket.on('message', async (data: string) => {
      let msg: WSEvent = JSON.parse(data);
      if (msg.action === 'log') {
        return self.log.info(`[SERVER-${ msg.action }] ${ msg.data }`);
      }
      self.log.debug(data);
      if (TOOLS.isNullOrUndefined(msg.action)) return;
      if (TOOLS.isNullOrUndefined(msg.data)) return;
      await self.emitEvent(null, 'message', msg);
    });
  }

  init(): Promise<void> {
    const self = this;
    return new Promise(async (resolve) => {
      await self.reconnect();

      await self.onEvent<WSEvent>(null, 'send', async (data) => {
        if (TOOLS.isNullOrUndefined(data)) return;
        if (TOOLS.isNullOrUndefined(data.action)) return;
        if (typeof data.action !== 'string') return;

        if (WebSocket === undefined || WebSocket === null) {
          return self.log.warn('WS NOT CONNECTED YET');
        }
        try {
          self.WebSocket.send(JSON.stringify({
            action: data.action,
            data: data.data,
            auth: (await self.getPluginConfig()).token || '',
          }));
        } catch (exc) {
          self.log.error(exc);
        }
      });

      self.log.info("Client started");
      resolve();
    });
  }
};