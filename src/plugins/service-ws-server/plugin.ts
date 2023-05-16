import * as WEBSOCKET from "ws";
import { Tools, Tools as TOOLS } from "@bettercorp/tools/lib/Tools";
import {
  IPWebSocket,
  IPWebSocketServer,
  IToken,
  WSClientSpecialActions,
  WSServerOnEmitReturnableEvents,
  WSServerOnEvents,
  WSServerOnReturnableEvents,
} from "../..";
import { v4 as UUID } from "uuid";
import { hostname } from "os";
import { IWSServerPluginConfig } from "./sec.config";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { IncomingMessage } from "http";
import {
  ServicesBase,
  ServiceCallable,
  IPluginLogger,
} from "@bettercorp/service-base";

export class Service extends ServicesBase<
  ServiceCallable,
  WSServerOnEvents,
  WSServerOnReturnableEvents,
  WSServerOnEmitReturnableEvents,
  ServiceCallable,
  IWSServerPluginConfig
> {
  private WebSocketServer!: IPWebSocketServer;
  private serverID: string;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    this.serverID = hostname() + UUID();
  }

  private getSafeData(ws: IPWebSocket, req: IncomingMessage) {
    return {
      ws: {
        connectionId: ws.connectionId,
        token: ws.token,
        session: ws.session,
        tokenData: ws.tokenData,
      },
      req: {
        headers: req.headers,
      },
    };
  }
  private getIPFromHeaders(req: IncomingMessage) {
    let headerKeys: IDictionary<string> = {};
    for (let hKey of Object.keys(req.headers))
      headerKeys[hKey.toLowerCase()] = hKey;

    return (
      req.headers[headerKeys["true-client-ip"]] ||
      req.headers[headerKeys["cf-connecting-ip"]] ||
      req.headers[headerKeys["x-client-ip"]] ||
      req.headers[headerKeys["x-forwarded-for"]] ||
      req.socket.remoteAddress ||
      "private"
    ).toString();
  }
  public override async init(): Promise<void> {
    const self = this;
    const config = await self.getPluginConfig();
    if (Tools.isString(config.serverId)) {
      self.serverID = config.serverId;
    }
    self.WebSocketServer = new WEBSOCKET.Server({
      port: config.port,
    }) as any as IPWebSocketServer;

    setInterval(() => {
      self.WebSocketServer.clients.forEach(async (client) => {
        let pinged = await new Promise<boolean>((resolve) => {
          client.ping(undefined, undefined, (err) => {
            if (err) {
              return resolve(false);
            }
            return resolve(true);
          });
        });
        if (!pinged) {
          await self.log.info(
            "Client [{connectionId}] timed out / ping failure",
            {
              connectionId: client.connectionId,
            }
          );
          return client.terminate();
        }
        if (config.serverMode === "single")
          await self.emitEventSpecific(
            self.serverID,
            "onConnectionCheckin",
            self.serverID,
            client.connectionId,
            client.session ?? null,
            client.tokenData ?? null
          );
        else
          await self.emitEvent(
            "onConnectionCheckin",
            self.serverID,
            client.connectionId,
            client.session ?? null,
            client.tokenData ?? null
          );
        if (Tools.isNullOrUndefined(client.tokenData)) return;
        try {
          let token: any | Boolean =
            config.serverMode === "single"
              ? await self.emitEventAndReturnSpecific(
                  self.serverID,
                  "onAuth",
                  self.serverID,
                  client.connectionId,
                  client.session ?? null,
                  client.tokenData ?? null,
                  null
                )
              : await self.emitEventAndReturn(
                  "onAuth",
                  self.serverID,
                  client.connectionId,
                  client.session ?? null,
                  client.tokenData ?? null,
                  null
                );
          if (typeof token !== "boolean") {
            return; // auth success
          }
          client.send(
            JSON.stringify({
              action: WSClientSpecialActions.log,
              data: "UNAuthenticated",
            })
          );
          client.token = false;
          client.tokenData = null;
        } catch (exc: any) {
          client.send(
            JSON.stringify({
              action: WSClientSpecialActions.log,
              data: "UNAuthenticated.",
            })
          );
          client.token = false;
          client.tokenData = null;
          await self.log.error(exc);
        }
      });
    }, 30000);

    if (config.serverMode === "generic")
      await self.onReturnableEvent("getConnectedSessions", async () => {
        let listOfConnections = [];
        for (let client of self.WebSocketServer.clients) {
          listOfConnections.push(client.connectionId);
        }
        return listOfConnections;
      });
    else
      await self.onReturnableEventSpecific(
        self.serverID,
        "getConnectedSessions",
        async () => {
          let listOfConnections = [];
          for (let client of self.WebSocketServer.clients) {
            listOfConnections.push(client.connectionId);
          }
          return listOfConnections;
        }
      );

    self.WebSocketServer.on(
      "connection",
      async (ws: IPWebSocket, req: IncomingMessage) => {
        ws.token = false;
        ws.session = null;
        ws.connectionId = hostname() + UUID();
        let clientSession: string | null = null;
        let safeData = self.getSafeData(ws, req);
        if (config.serverMode === "single")
          await self.emitEventSpecific(
            self.serverID,
            "onConnection",
            self.serverID,
            self.getIPFromHeaders(req),
            safeData.ws.connectionId,
            safeData.ws.token ?? false,
            safeData.ws.session ?? null,
            safeData.req.headers
          );
        else
          await self.emitEvent(
            "onConnection",
            self.serverID,
            self.getIPFromHeaders(req),
            safeData.ws.connectionId,
            safeData.ws.token ?? false,
            safeData.ws.session ?? null,
            safeData.req.headers
          );

        await self.log.info(`Client Connected [{clientIP}-{clientSession}]`, {
          clientIP: self.getIPFromHeaders(req),
          clientSession: clientSession || "{no_session}",
        });
        const forceDC = async (reason: string) => {
          let xsafeData = self.getSafeData(ws, req);
          if (config.serverMode === "single")
            await self.emitEventSpecific(
              self.serverID,
              "onForcedDisconnect",
              self.serverID,
              self.getIPFromHeaders(req),
              xsafeData.ws.connectionId,
              xsafeData.ws.token ?? false,
              xsafeData.ws.session ?? null,
              xsafeData.req.headers
            );
          else
            await self.emitEvent(
              "onForcedDisconnect",
              self.serverID,
              self.getIPFromHeaders(req),
              xsafeData.ws.connectionId,
              xsafeData.ws.token ?? false,
              xsafeData.ws.session ?? null,
              xsafeData.req.headers
            );
          await self.log.info(
            "Client force disconnected [{clientIP}-{clientSession}] - {reason}",
            {
              clientIP: self.getIPFromHeaders(req),
              clientSession: clientSession || "{no_session}",
              reason: reason,
            }
          );
          ws.terminate();
        };

        ws.on("message", async (messageStr: string) => {
          await self.log.debug(
            "Message received from [{clientIP}-{clientSession}] - {message}",
            {
              clientIP: self.getIPFromHeaders(req),
              clientSession: clientSession || "{no_session}",
              message: messageStr,
            }
          );
          if (messageStr === undefined || messageStr === null)
            return await forceDC("They`re sending me weird messages");

          let message!: {
            action: string;
            data: any;
            auth: string;
          };
          try {
            message = JSON.parse(messageStr);
            const lockedFields = ["action", "data", "auth"];
            const msgFields = Object.keys(message);
            const isValidFields = () => {
              for (const field of msgFields)
                if (lockedFields.indexOf(field) < 0) return false;
              return true;
            };

            if (!isValidFields())
              throw `Messaged received does not match type! :(${lockedFields})!=(${msgFields}): ${messageStr}`;

            if (message.action === undefined || message.action === null)
              return await forceDC(
                "They`re sending me weird messages (no action)"
              );
            if (message.data === undefined || message.data === null)
              return await forceDC(
                "They`re sending me weird messages (no data)"
              );

            if (message.action === WSClientSpecialActions.ping) {
              if (
                message.data.session !== undefined &&
                message.data.session !== null &&
                message.data.session.session !== undefined &&
                message.data.session.session !== null &&
                message.data.session.session !== ""
              ) {
                if (clientSession !== null) {
                  if (message.data.session.session !== clientSession)
                    return await forceDC("Client session changed?!? WHY");
                }
                if (clientSession === null) {
                  clientSession = message.data.session.session;
                  ws.session = message.data.session.session;
                }
              }
              return;
            }
            await self.log.debug(
              "Received action [{clientIP}-{clientSession}]: {action}",
              {
                clientIP: self.getIPFromHeaders(req),
                clientSession: req.headers["session"] ?? "{no_session}",
                action: message.action,
              }
            );
            let authDataSent =
              !TOOLS.isNullOrUndefined(message.auth) &&
              typeof message.auth === "string";
            if (authDataSent || !Tools.isNullOrUndefined(ws.tokenData)) {
              try {
                let token: any | Boolean =
                  config.serverMode === "single"
                    ? await self.emitEventAndReturnSpecific(
                        self.serverID,
                        "onAuth",
                        self.serverID,
                        ws.connectionId,
                        clientSession ?? null,
                        (authDataSent ? message.auth : ws.tokenData) ?? null,
                        self.getIPFromHeaders(req)
                      )
                    : await self.emitEventAndReturn(
                        "onAuth",
                        self.serverID,
                        ws.connectionId,
                        clientSession ?? null,
                        (authDataSent ? message.auth : ws.tokenData) ?? null,
                        self.getIPFromHeaders(req)
                      );
                if (typeof token !== "boolean") {
                  ws.token = token as IToken;
                  if (message.auth !== ws.tokenData) {
                    let ysafeData = self.getSafeData(ws, req);
                    if (config.serverMode === "single")
                      self.emitEventSpecific(
                        self.serverID,
                        "onConnectionAuthChanged",
                        self.serverID,
                        self.getIPFromHeaders(req),
                        ysafeData.ws.connectionId,
                        ysafeData.ws.token ?? false,
                        ysafeData.ws.session ?? null,
                        ysafeData.req.headers
                      );
                    else
                      self.emitEvent(
                        "onConnectionAuthChanged",
                        self.serverID,
                        self.getIPFromHeaders(req),
                        ysafeData.ws.connectionId,
                        ysafeData.ws.token ?? false,
                        ysafeData.ws.session ?? null,
                        ysafeData.req.headers
                      );
                    ws.send(
                      JSON.stringify({
                        action: WSClientSpecialActions.log,
                        data: "Authenticated",
                      })
                    );
                    await self.log.info(`Auth req: Authed as {userId}`, {
                      userId: ws.token.sub,
                    });
                  }
                  ws.tokenData = message.auth;
                } else {
                  ws.send(
                    JSON.stringify({
                      action: WSClientSpecialActions.log,
                      data: "AuthNe",
                    })
                  );
                  ws.token = false;
                }
              } catch (exc: any) {
                ws.send(
                  JSON.stringify({
                    action: WSClientSpecialActions.log,
                    data: "UNAuthenticated",
                  })
                );
                ws.token = false;
                await self.log.error(exc);
                return;
                //return await forceDC('- Auth failed');
              }
            }
            if (message.action == WSClientSpecialActions.log) {
              await self.log.debug(
                "Client log [{clientIP}-{clientSession}]: {message}",
                {
                  clientIP: self.getIPFromHeaders(req),
                  clientSession: req.headers["session"] ?? "{no_session}",
                  message: message.data,
                }
              );
              if (config.serverMode === "single")
                await self.emitEventSpecific(
                  self.serverID,
                  "onLog",
                  self.serverID,
                  self.getIPFromHeaders(req),
                  ws.connectionId,
                  (Tools.isBoolean(ws.token) ? false : (ws.token as IToken)) ??
                    false,
                  clientSession ?? null,
                  message.data
                );
              else
                await self.emitEventSpecific(
                  self.serverID,
                  "onLog",
                  self.serverID,
                  self.getIPFromHeaders(req),
                  ws.connectionId,
                  (Tools.isBoolean(ws.token) ? false : (ws.token as IToken)) ??
                    false,
                  clientSession ?? null,
                  message.data
                );
              return;
            }
            if (message.action == WSClientSpecialActions.auth) {
              return;
            }

            if (config.forceAuthenticate === true) {
              if (Tools.isNullOrUndefined(ws.token) || ws.token == false) {
                if (config.notifyClientOnNoAuth === true)
                  return ws.send(
                    JSON.stringify({
                      action: WSClientSpecialActions.log,
                      data: "NOAuthenticated",
                    })
                  );
                else return;
              }
            }

            if (config.serverMode === "single")
              await self.emitEventSpecific(
                self.serverID,
                "onReceive",
                self.serverID,
                self.getIPFromHeaders(req),
                ws.connectionId,
                (Tools.isBoolean(ws.token) ? false : (ws.token as IToken)) ??
                  false,
                clientSession ?? null,
                message.action,
                message.data
              );
            else
              await self.emitEvent(
                "onReceive",
                self.serverID,
                self.getIPFromHeaders(req),
                ws.connectionId,
                (Tools.isBoolean(ws.token) ? false : (ws.token as IToken)) ??
                  false,
                clientSession ?? null,
                message.action,
                message.data
              );
          } catch (Exc: any) {
            self.log.error(Exc);
            return forceDC(
              "They`re sending me weird messages (garbage [" + messageStr + "])"
            );
          }
        });
        ws.on("close", async (conn) => {
          let ysafeData = self.getSafeData(ws, req);
          if (config.serverMode === "single")
            await self.emitEventSpecific(
              self.serverID,
              "onConnectionClose",
              self.serverID,
              self.getIPFromHeaders(req),
              ysafeData.ws.connectionId,
              ysafeData.ws.token ?? false,
              ysafeData.ws.session ?? null,
              ysafeData.req.headers
            );
          else
            await self.emitEvent(
              "onConnectionClose",
              self.serverID,
              self.getIPFromHeaders(req),
              ysafeData.ws.connectionId,
              ysafeData.ws.token ?? false,
              ysafeData.ws.session ?? null,
              ysafeData.req.headers
            );
          await self.log.info(
            "Client Disconnected [{clientIP}-{clientSession}]",
            {
              clientIP: self.getIPFromHeaders(req),
              clientSession: req.headers["session"] ?? "{no_session}",
            }
          );
        });

        ws.send(
          JSON.stringify({
            action: WSClientSpecialActions.log,
            data: "Hello Flightless Bird",
          })
        );
      }
    );

    if (config.serverMode === "generic")
      await self.onReturnableEvent(
        "send",
        async (
          connectionId: string,
          action: WSClientSpecialActions | string,
          data: any
        ): Promise<void> => {
          if (TOOLS.isNullOrUndefined(action))
            return self.log.error("received garbage! NO ACTION");
          if (TOOLS.isNullOrUndefined(data))
            return self.log.error("received garbage! NO DATA");
          if (TOOLS.isNullOrUndefined(connectionId))
            return self.log.error("received garbage! NO CONN ID");
          if (typeof action !== "string")
            return self.log.error("received garbage! NO ACTION AS STRING");

          for (let client of self.WebSocketServer.clients) {
            if (client.connectionId !== connectionId) continue;
            client.send(
              JSON.stringify({
                action: action,
                data: data,
              })
            );
            return;
          }
        }
      );
    else
      await self.onReturnableEventSpecific(
        self.serverID,
        "send",
        async (
          connectionId: string,
          action: WSClientSpecialActions | string,
          data: any
        ): Promise<void> => {
          if (TOOLS.isNullOrUndefined(action))
            return self.log.error("received garbage! NO ACTION");
          if (TOOLS.isNullOrUndefined(data))
            return self.log.error("received garbage! NO DATA");
          if (TOOLS.isNullOrUndefined(connectionId))
            return self.log.error("received garbage! NO CONN ID");
          if (typeof action !== "string")
            return self.log.error("received garbage! NO ACTION AS STRING");

          for (let client of self.WebSocketServer.clients) {
            if (client.connectionId !== connectionId) continue;
            client.send(
              JSON.stringify({
                action: action,
                data: data,
              })
            );
            return;
          }
        }
      );

    if (config.serverMode === "generic")
      await self.onReturnableEvent(
        "forceDisconnect",
        async (connectionIds: Array<string> | string, reason: string) => {
          if (TOOLS.isNullOrUndefined(connectionIds))
            return self.log.error("received garbage! NO CONNECTION ID");
          if (TOOLS.isNullOrUndefined(reason))
            return self.log.error("received garbage! NO REASON");

          let connectionId = TOOLS.isArray(connectionIds)
            ? connectionIds
            : [connectionIds];

          for (let client of self.WebSocketServer.clients) {
            if (connectionId.indexOf(client.connectionId) < 0) continue;
            client.terminate();
            await self.log.warn(
              "Force disconnected {connectionId} ({reason})",
              {
                connectionId: connectionId,
                reason: reason,
              }
            );
          }
        }
      );
    else
      await self.onReturnableEventSpecific(
        self.serverID,
        "forceDisconnect",
        async (connectionIds: Array<string> | string, reason: string) => {
          if (TOOLS.isNullOrUndefined(connectionIds))
            return self.log.error("received garbage! NO CONNECTION ID");
          if (TOOLS.isNullOrUndefined(reason))
            return self.log.error("received garbage! NO REASON");

          let connectionId = TOOLS.isArray(connectionIds)
            ? connectionIds
            : [connectionIds];

          for (let client of self.WebSocketServer.clients) {
            if (connectionId.indexOf(client.connectionId) < 0) continue;
            client.terminate();
            await self.log.warn(
              "Force disconnected {connectionId} ({reason})",
              {
                connectionId: connectionId,
                reason: reason,
              }
            );
          }
        }
      );

    await self.log.info("Server started");
  }
}
