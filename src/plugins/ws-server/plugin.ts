import * as WEBSOCKET from 'ws';
import { CPlugin, CPluginClient } from '@bettercorp/service-base/lib/interfaces/plugins';
import { Tools, Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { IPWebSocket, IPWebSocketServer, IToken, WSClientSpecialActions, WSServerData, WSServerEvents } from '../../lib';
import { v4 as UUID } from 'uuid';
import { hostname } from 'os';
import { IWSServerPluginConfig } from './sec.config';
import { IDictionary } from '@bettercorp/tools/lib/Interfaces';
import { IncomingMessage } from 'http';

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
  serverId: string
  clientIP?: string
}

export class wsServer extends CPluginClient<any> {
  public readonly _pluginName: string = "ws-server";

  forceDisconnect(data: WSServerData, serverId: string): Promise<void> {
    return this.emitEvent(WSServerEvents.forceDisconnect + serverId, data);
  }
  send(data: WSServerData, serverId: string): Promise<void> {
    return this.emitEvent(WSServerEvents.send + serverId, data);
  }
  async getConnectedSessions(serverId: string): Promise<Array<any>> {
    return await this.emitEventAndReturn(WSServerEvents.getConnectedSessions + serverId);
  }
  onConnectionCheckin(listener: (client: any) => void) {
    return this.onEvent(WSServerEvents.onConnectionCheckin, listener);
  }
  onConnection(listener: (req: any) => void) {
    return this.onEvent(WSServerEvents.onConnection, listener);
  }
  onForcedDisconnect(listener: (req: any) => void) {
    return this.onEvent(WSServerEvents.onForcedDisconnect, listener);
  }
  onConnectionAuthChanged(listener: (req: any) => void) {
    return this.onEvent(WSServerEvents.onConnectionAuthChanged, listener);
  }
  onConnectionClose(listener: (req: any) => void) {
    return this.onEvent(WSServerEvents.onConnectionClose, listener);
  }
  onMessage(listener: (req: IWSServerMessageEvent) => void) {
    return this.onEvent(WSServerEvents.receive, listener);
  }
  onAuth(listener: (data?: IWSServerAuthRequest) => Promise<any>) {
    return this.onReturnableEvent(WSServerEvents.auth, listener);
  }
}
export class Plugin extends CPlugin<IWSServerPluginConfig> {
  private WebSocketServer!: IPWebSocketServer;
  private serverID: string = hostname() + UUID();

  private getIPFromHeaders(req: IncomingMessage) {
    let headerKeys: IDictionary<string> = {};
    for (let hKey of Object.keys(req.headers))
      headerKeys[hKey.toLowerCase()] = hKey;

    return (req.headers[headerKeys['true-client-ip']] ||
      req.headers[headerKeys['cf-connecting-ip']] ||
      req.headers[headerKeys['x-client-ip']] ||
      req.headers[headerKeys['x-forwarded-for']] ||
      req.socket.remoteAddress || 'private').toString();
  }

  private getSafeData(ws: any, req: any) {
    return {
      ws: {
        connectionId: ws.connectionId,
        token: ws.token,
        session: ws.session,
        tokenData: ws.tokenData,
      },
      req: {
        headers: req.headers
      }
    };
  }

  init(): Promise<void> {
    const self = this;
    return new Promise(async (resolve) => {
      self.WebSocketServer = new WEBSOCKET.Server({
        port: (await self.getPluginConfig()).port
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
          await self.emitEvent(null, WSServerEvents.onConnectionCheckin, client);
          if (Tools.isNullOrUndefined(client.tokenData)) return;
          try {
            let token: any | Boolean = await self.emitEventAndReturn<IWSServerAuthRequest>(null, WSServerEvents.auth, {
              connectionId: client.connectionId,
              session: client.session || '{no_session}',
              token: client.tokenData as string,
              sourcePlugin: self.pluginName,
              serverId: self.serverID,
            });
            if (typeof token !== 'boolean') {
              return; // auth success
            }
            client.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated' }));
            client.token = false;
            client.tokenData = null;
          } catch (exc) {
            client.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated.' }));
            client.token = false;
            client.tokenData = null;
            self.log.error(exc);
          }
        });
      }, 30000);

      await self.onReturnableEvent(null, WSServerEvents.getConnectedSessions + self.serverID, () => new Promise((resolve) => {
        let listOfConnections = [];
        for (let client of self.WebSocketServer.clients) {
          listOfConnections.push(client.connectionId);
        }
        resolve(listOfConnections);
      }));

      self.WebSocketServer.on('connection', async (ws: IPWebSocket, req) => {
        ws.token = false;
        ws.session = null;
        ws.connectionId = hostname() + UUID();
        let clientSession: string | null = null;
        await self.emitEvent(null, WSServerEvents.onConnection, {
          ...self.getSafeData(ws, req),
          sourcePlugin: self.pluginName,
          serverId: self.serverID,
          clientIP: self.getIPFromHeaders(req)
        });
        self.log.info(`Client Connected [${ self.getIPFromHeaders(req) }-${ clientSession || '{no_session}' }]`);
        const forceDC = async (reason: string) => {
          await self.emitEvent(null, WSServerEvents.onForcedDisconnect, {
            ...self.getSafeData(ws, req),
            sourcePlugin: self.pluginName,
            serverId: self.serverID,
            clientIP: self.getIPFromHeaders(req)
          });
          self.log.info(`Client force disconnected [${ self.getIPFromHeaders(req) }-${ clientSession || '{no_session}' }] - ${ reason }`);
          ws.terminate();
        };

        ws.on('message', async (messageStr: string) => {
          self.log.info(`${ new Date().getTime() } ${ self.getIPFromHeaders(req) } ${ clientSession || '{no_session}' } > [WS] ${ messageStr }`);
          if (messageStr === undefined || messageStr === null)
            return await forceDC('They`re sending me weird messages');

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
              return await forceDC('They`re sending me weird messages (no action)');
            if (message.data === undefined || message.data === null)
              return await forceDC('They`re sending me weird messages (no data)');

            if (message.action === WSClientSpecialActions.ping) {
              if (message.data.session !== undefined && message.data.session !== null && message.data.session.session !== undefined && message.data.session.session !== null && message.data.session.session !== '') {
                if (clientSession !== null) {
                  if (message.data.session.session !== clientSession)
                    return await forceDC('Client session changed?!? WHY');
                }
                if (clientSession === null) {
                  clientSession = message.data.session.session;
                  ws.session = message.data.session.session;
                }
              }
              return;
            }
            self.log.info(`Received action [${ self.getIPFromHeaders(req) }-${ req.headers['session'] }]: ${ message.action }`);
            let authDataSent = !TOOLS.isNullOrUndefined(message.auth) && typeof message.auth === 'string';
            if (authDataSent || !Tools.isNullOrUndefined(ws.tokenData)) {
              try {
                let token: any | Boolean = await self.emitEventAndReturn<IWSServerAuthRequest>(null, WSServerEvents.auth, {
                  connectionId: ws.connectionId,
                  session: clientSession || '{no_session}',
                  token: authDataSent ? message.auth : ws.tokenData,
                  sourcePlugin: self.pluginName,
                  serverId: self.serverID,
                  clientIP: self.getIPFromHeaders(req)
                });
                if (typeof token !== 'boolean') {
                  ws.token = token as IToken;
                  if (message.auth !== ws.tokenData) {
                    self.emitEvent(null, WSServerEvents.onConnectionAuthChanged, {
                      ...self.getSafeData(ws, req),
                      sourcePlugin: self.pluginName,
                      serverId: self.serverID,
                      clientIP: self.getIPFromHeaders(req)
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
                return await forceDC('- Auth failed');
              }
            }
            if (message.action == WSClientSpecialActions.log) {
              self.log.info(`WS Client [${ self.getIPFromHeaders(req) }-${ req.headers['session'] }]`, message.data);
              return;
            }
            if (message.action == WSClientSpecialActions.auth) {
              return;
            }

            if ((await self.getPluginConfig()).forceAuthenticate === true)
              if (Tools.isNullOrUndefined(ws.token) || ws.token == false)
                if ((await self.getPluginConfig()).notifyClientOnNoAuth === true)
                  return ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'NOAuthenticated' }));
                else return;

            await self.emitEvent(null, WSServerEvents.receive, {
              token: ws.token || false,
              session: clientSession || new Date().getTime(),
              connectionId: ws.connectionId,
              action: message.action,
              data: message.data,
              sourcePlugin: self.pluginName,
              serverId: self.serverID,
              clientIP: self.getIPFromHeaders(req)
            });
          } catch (Exc) {
            self.log.error(Exc);
            return forceDC('They`re sending me weird messages (garbage [' + messageStr + '])');
          }
        });
        ws.on('close', async (conn) => {
          await self.emitEvent(null, WSServerEvents.onConnectionClose, {
            ...self.getSafeData(ws, req),
            sourcePlugin: self.pluginName,
            serverId: self.serverID,
            clientIP: self.getIPFromHeaders(req)
          });
          self.log.info(`Client Disconnected [${ self.getIPFromHeaders(req) }-${ req.headers['session'] }]`);
        });

        ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'Hello Flightless Bird' }));
      });

      await self.onEvent(null, WSServerEvents.send + self.serverID, async (data: WSServerData) => {
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

      await self.onEvent(null, WSServerEvents.forceDisconnect + self.serverID, async (data: WSServerData) => {
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