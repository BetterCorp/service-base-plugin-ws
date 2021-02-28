import * as WEBSOCKET from 'ws';
import { IPlugin, PluginFeature } from '@bettercorp/service-base/lib/ILib';
import { Tools, Tools as TOOLS } from '@bettercorp/tools/lib/Tools';
import { IPWebSocket, IPWebSocketServer, IToken, WSClientSpecialActions, WSServerData, WSServerEvents } from '../../lib';
import { v4 as UUID } from 'uuid';
import { hostname } from 'os';

export class Plugin implements IPlugin {
  private WebSocketServer!: IPWebSocketServer;
  //private Features!: PluginFeature;

  init (features: PluginFeature): Promise<void> {
    //this.Features = features;
    const self = this;
    return new Promise((resolve) => {
      self.WebSocketServer = new WEBSOCKET.Server({
        port: features.getPluginConfig().port
      }) as any as IPWebSocketServer;

      setInterval(() => {
        self.WebSocketServer.clients.forEach(async client => {
          client.ping();
          if (Tools.isNullOrUndefined(client.tokenData)) return;
          try {
            let token: any | Boolean = await features.emitEventAndReturn(null, WSServerEvents.auth, {
              connectionId: client.connectionId,
              session: client.session || '{no_session}',
              token: client.tokenData as string
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
            features.log.error(exc);
          }
        });
      }, 30000);

      self.WebSocketServer.on('connection', function (ws: IPWebSocket, req) {
        ws.token = false;
        ws.session = null;
        ws.connectionId = hostname() + UUID();
        let clientSession: string | null = null;
        features.emitEvent(null, WSServerEvents.onConnection, { ws, req });
        features.log.info(`Client Connected [${req.headers['x-forwarded-for'] || req.socket.remoteAddress}-${clientSession || '{no_session}'}]`);
        const forceDC = (reason: string) => {
          features.emitEvent(null, WSServerEvents.onForcedDisconnect, { ws, req });
          features.log.info(`Client force disconnected [${req.headers['x-forwarded-for'] || req.socket.remoteAddress}-${clientSession || '{no_session}'}] - ${reason}`);
          ws.terminate();
        };

        ws.on('message', async (messageStr: string) => {
          features.log.info(`${new Date().getTime()} ${req.headers['x-forwarded-for'] || req.socket.remoteAddress} ${clientSession || '{no_session}'} > [WS] ${messageStr}`);
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
              throw `Messaged received does not match type! :(${lockedFields})!=(${msgFields}): ${messageStr}`;

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
            features.log.info(`Received action [${req.headers['x-forwarded-for'] || req.socket.remoteAddress}-${req.headers['session']}]: ${message.action}`);
            let authDataSent = !TOOLS.isNullOrUndefined(message.auth) && typeof message.auth === 'string';
            if (authDataSent || !Tools.isNullOrUndefined(ws.tokenData)) {
              try {
                let token: any | Boolean = await features.emitEventAndReturn(null, WSServerEvents.auth, {
                  connectionId: ws.connectionId,
                  session: clientSession || '{no_session}',
                  token: authDataSent ? message.auth : ws.tokenData
                });
                if (typeof token !== 'boolean') {
                  ws.token = token as IToken;
                  if (message.auth !== ws.tokenData) {
                    features.emitEvent(null, WSServerEvents.onConnectionAuthChanged, { ws, req });
                    ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'Authenticated' }));
                    features.log.info(`Auth req: Authed`);
                  }
                  ws.tokenData = message.auth;
                }
              } catch (exc) {
                ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'UNAuthenticated' }));
                ws.token = false;
                features.log.error(exc);
                return forceDC('- Auth failed');
              }
            }
            if (message.action == WSClientSpecialActions.log) {
              features.log.info(`WS Client [${req.headers['x-forwarded-for'] || req.socket.remoteAddress}-${req.headers['session']}]`, message.data);
              return;
            }
            if (message.action == WSClientSpecialActions.auth) {
              return;
            }

            if (features.getPluginConfig().forceAuthenticate === true)
              if (Tools.isNullOrUndefined(ws.token) || ws.token == false)
                if (features.getPluginConfig().notifyClientOnNoAuth === true)
                  return ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'NOAuthenticated' }));
                else return;

            features.emitEvent(null, WSServerEvents.receive, {
              token: ws.token || false,
              session: clientSession || new Date().getTime(),
              connectionId: ws.connectionId,
              action: message.action,
              data: message.data
            });
          } catch (Exc) {
            features.log.error(Exc);
            return forceDC('They`re sending me weird messages (garbage [' + messageStr + '])');
          }
        });
        ws.on('close', (conn) => {
          features.emitEvent(null, WSServerEvents.onConnectionClose, { ws, req });
          features.log.info(`Client Disconnected [${req.headers['x-forwarded-for'] || req.socket.remoteAddress}-${req.headers['session']}]`);
        });

        ws.send(JSON.stringify({ action: WSClientSpecialActions.log, data: 'Hello Flightless Bird' }));
      });

      features.onEvent(null, WSServerEvents.send, (data: WSServerData) => {
        if (TOOLS.isNullOrUndefined(data.action)) return features.log.error('received garbage! NO ACTION');
        if (TOOLS.isNullOrUndefined(data.data)) return features.log.error('received garbage! NO DATA');
        if (typeof data.action !== 'string') return features.log.error('received garbage! NO ACTION AS STRING');

        for (let client of self.WebSocketServer.clients) {
          if (data.connectionId !== data.connectionId)
            continue;
          client.send(JSON.stringify({
            action: data.action,
            data: data.data,
          }));
          return;
        }
      });

      features.onEvent(null, WSServerEvents.forceDisconnect, (data: WSServerData) => {
        if (TOOLS.isNullOrUndefined(data.action)) return features.log.error('received garbage! NO ACTION');
        if (TOOLS.isNullOrUndefined(data.data)) return features.log.error('received garbage! NO DATA');
        if (typeof data.action !== 'string') return features.log.error('received garbage! NO ACTION AS STRING');

        for (let client of self.WebSocketServer.clients) {
          if (data.connectionId !== data.connectionId)
            continue;
          client.terminate();
          return;
        }
      });

      features.log.info("Server started");
      resolve();
    });
  }
};