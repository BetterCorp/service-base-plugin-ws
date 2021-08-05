import * as WEBSOCKET from 'ws';
import { CPlugin, CPluginClient } from '@bettercorp/service-base/lib/ILib';
import { Tools, Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { IPWebSocket, IPWebSocketServer, IToken, WSClientSpecialActions, WSServerData, WSServerEvents } from '../../lib';
import { v4 as UUID } from 'uuid';
import { hostname } from 'os';
import { IWSServerPluginConfig } from './sec.config';

export interface IWSServerMessageEvent {
  token: boolean | any;
  session: string;
  connectionId: string;
  action: string;
  data: any;
  sourcePlugin: string;
}
export interface IWSServerAuthRequest {
  connectionId: string;
  session: string;
  token: string | boolean;
  sourcePlugin: string;
}
export type PromiseResolve<TData = any, TReturn = void> = (data: TData) => TReturn;
export class wsServer extends CPluginClient<any> {
  public readonly _pluginName: string = "ws-server";

  forceDisconnect(data: WSServerData): void {
    this.emitEvent(WSServerEvents.forceDisconnect, data);
  }
  send(data: WSServerData): any {
    return this.emitEvent(WSServerEvents.send, data);
  }
  async getConnectedSessions(): Promise<Array<any>> {
    return await this.emitEventAndReturn(WSServerEvents.getConnectedSessions);
  }
  onConnectionCheckin(listener: (client: any) => void) {
    this.onEvent(WSServerEvents.onConnectionCheckin, listener);
  }
  onConnection(listener: (req: any) => void) {
    this.onEvent(WSServerEvents.onConnection, (x) => listener(x));
  }
  onForcedDisconnect(listener: (req: any) => void) {
    this.onEvent(WSServerEvents.onForcedDisconnect, (x) => listener(x));
  }
  onConnectionAuthChanged(listener: (req: any) => void) {
    this.onEvent(WSServerEvents.onConnectionAuthChanged, (x) => listener(x));
  }
  onConnectionClose(listener: (req: any) => void) {
    this.onEvent(WSServerEvents.onConnectionClose, (x) => listener(x));
  }
  onMessage(listener: (req: IWSServerMessageEvent) => void) {
    this.onEvent(WSServerEvents.receive, listener);
  }
  onAuth(listener: (resolve: PromiseResolve<any, void>, reject: PromiseResolve<any, void>, request: IWSServerAuthRequest) => void) {
    this.onReturnableEvent(WSServerEvents.auth, listener as any);
  }
}
export class Plugin extends CPlugin<IWSServerPluginConfig> {
  private WebSocketServer!: IPWebSocketServer;

  init(): Promise<void> {
    const self = this;
    return new Promise((resolve) => {
      self.WebSocketServer = new WEBSOCKET.Server({
        port: self.getPluginConfig().port
      }) as any as IPWebSocketServer;

      setInterval(() => {
        self.WebSocketServer.clients.forEach(async client => {
          let pinged = await (new Promise<boolean>((resolve) => {
            client.ping(undefined, undefined, (err) => {
              if (err) {
                return resolve(false);
              }
              return resolve(true);
            });
          }));
          if (!pinged) {
            self.log.info(`${ new Date().getTime() } ${ client.connectionId } TIMED OUT / PING FAILURE`);
            return client.terminate();
          }
          self.emitEvent(null, WSServerEvents.onConnectionCheckin, client);
          if (Tools.isNullOrUndefined(client.tokenData)) return;
          try {
            let token: any | Boolean = await self.emitEventAndReturn(null, WSServerEvents.auth, {
              connectionId: client.connectionId,
              session: client.session || '{no_session}',
              token: client.tokenData as string,
              sourcePlugin: self.pluginName
            });
            if (typeof token !== 'boolean') {
              return; // auth success
            }
            client.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated' }));
            client.token = false;
            client.tokenData = null;
          } catch (exc) {
            client.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated' }));
            client.token = false;
            client.tokenData = null;
            self.log.error(exc);
          }
        });
      }, 30000);

      self.onReturnableEvent(null, WSServerEvents.getConnectedSessions, (resolve, reject, data) => {
        let listOfConnections = [];
        for (let client of self.WebSocketServer.clients) {
          listOfConnections.push(client.connectionId);
        }
        resolve(listOfConnections);
      });

      self.WebSocketServer.on('connection', function (ws: IPWebSocket, req) {
        ws.token = false;
        ws.session = null;
        ws.connectionId = hostname() + UUID();
        let clientSession: string | null = null;
        self.emitEvent(null, WSServerEvents.onConnection, {
          ws, req,
          sourcePlugin: self.pluginName
        });
        self.log.info(`Client Connected [${ req.headers['x-forwarded-for'] || req.socket.remoteAddress }-${ clientSession || '{no_session}' }]`);
        const forceDC = (reason: string) => {
          self.emitEvent(null, WSServerEvents.onForcedDisconnect, {
            ws, req,
            sourcePlugin: self.pluginName
          });
          self.log.info(`Client force disconnected [${ req.headers['x-forwarded-for'] || req.socket.remoteAddress }-${ clientSession || '{no_session}' }] - ${ reason }`);
          ws.terminate();
        };

        ws.on('message', async (messageStr: string) => {
          self.log.info(`${ new Date().getTime() } ${ req.headers['x-forwarded-for'] || req.socket.remoteAddress } ${ clientSession || '{no_session}' } > [WS] ${ messageStr }`);
          if (messageStr === undefined || messageStr === null)
            return forceDC('They`re sending me weird messages');

          let message!: WSServerData;
          try {
            message = JSON.parse(messageStr);
            const lockedFields = ['action', 'data', 'auth'];
            const msgFields = Object.keys(message);
            const isValidFields = () => {
              for (const field of msgFields)
                if (lockedFields.indexOf(field) < 0) return false;
              return true;
            };

            if (!isValidFields())
              throw `Messaged received does not match type! :(${ lockedFields })!=(${ msgFields }): ${ messageStr }`;

            if (message.action === undefined || message.action === null)
              return forceDC('They`re sending me weird messages (no action)');
            if (message.data === undefined || message.data === null)
              return forceDC('They`re sending me weird messages (no data)');

            if (message.action === WSClientSpecialActions.ping) {
              if (message.data.session !== undefined && message.data.session !== null && message.data.session.session !== undefined && message.data.session.session !== null && message.data.session.session !== '') {
                if (clientSession !== null) {
                  if (message.data.session.session !== clientSession)
                    return forceDC('Client session changed?!? WHY');
                }
                if (clientSession === null) {
                  clientSession = message.data.session.session;
                  ws.session = message.data.session.session;
                }
              }
              return;
            }
            self.log.info(`Received action [${ req.headers['x-forwarded-for'] || req.socket.remoteAddress }-${ req.headers['session'] }]: ${ message.action }`);
            let authDataSent = !TOOLS.isNullOrUndefined(message.auth) && typeof message.auth === 'string';
            if (authDataSent || !Tools.isNullOrUndefined(ws.tokenData)) {
              try {
                let token: any | Boolean = await self.emitEventAndReturn(null, WSServerEvents.auth, {
                  connectionId: ws.connectionId,
                  session: clientSession || '{no_session}',
                  token: authDataSent ? message.auth : ws.tokenData,
                  sourcePlugin: self.pluginName
                });
                if (typeof token !== 'boolean') {
                  ws.token = token as IToken;
                  if (message.auth !== ws.tokenData) {
                    self.emitEvent(null, WSServerEvents.onConnectionAuthChanged, {
                      ws, req,
                      sourcePlugin: self.pluginName
                    });
                    ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'Authenticated' }));
                    self.log.info(`Auth req: Authed`);
                  }
                  ws.tokenData = message.auth;
                }
              } catch (exc) {
                ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated' }));
                ws.token = false;
                self.log.error(exc);
                return forceDC('- Auth failed');
              }
            }
            if (message.action == WSClientSpecialActions.log) {
              self.log.info(`WS Client [${ req.headers['x-forwarded-for'] || req.socket.remoteAddress }-${ req.headers['session'] }]`, message.data);
              return;
            }
            if (message.action == WSClientSpecialActions.auth) {
              return;
            }

            if (self.getPluginConfig().forceAuthenticate === true)
              if (Tools.isNullOrUndefined(ws.token) || ws.token == false)
                if (self.getPluginConfig().notifyClientOnNoAuth === true)
                  return ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'NOAuthenticated' }));
                else return;

            self.emitEvent(null, WSServerEvents.receive, {
              token: ws.token || false,
              session: clientSession || new Date().getTime(),
              connectionId: ws.connectionId,
              action: message.action,
              data: message.data,
              sourcePlugin: self.pluginName
            });
          } catch (Exc) {
            self.log.error(Exc);
            return forceDC('They`re sending me weird messages (garbage [' + messageStr + '])');
          }
        });
        ws.on('close', (conn) => {
          self.emitEvent(null, WSServerEvents.onConnectionClose, {
            ws, req,
            sourcePlugin: self.pluginName
          });
          self.log.info(`Client Disconnected [${ req.headers['x-forwarded-for'] || req.socket.remoteAddress }-${ req.headers['session'] }]`);
        });

        ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'Hello Flightless Bird' }));
      });

      self.onEvent(null, WSServerEvents.send, (data: WSServerData) => {
        if (TOOLS.isNullOrUndefined(data.action)) return self.log.error('received garbage! NO ACTION');
        if (TOOLS.isNullOrUndefined(data.data)) return self.log.error('received garbage! NO DATA');
        if (TOOLS.isNullOrUndefined(data.connectionId)) return self.log.error('received garbage! NO CONN ID');
        if (typeof data.action !== 'string') return self.log.error('received garbage! NO ACTION AS STRING');

        for (let client of self.WebSocketServer.clients) {
          if (client.connectionId !== data.connectionId)
            continue;
          client.send(JSON.stringify({
            action: data.action,
            data: data.data,
          }));
          return;
        }
      });

      self.onEvent(null, WSServerEvents.forceDisconnect, (data: WSServerData) => {
        if (TOOLS.isNullOrUndefined(data.action)) return self.log.error('received garbage! NO ACTION');
        if (TOOLS.isNullOrUndefined(data.data)) return self.log.error('received garbage! NO DATA');
        if (typeof data.action !== 'string') return self.log.error('received garbage! NO ACTION AS STRING');

        for (let client of self.WebSocketServer.clients) {
          if (data.connectionId !== data.connectionId)
            continue;
          client.terminate();
          return;
        }
      });

      self.log.info("Server started");
      resolve();
    });
  }
};