import { ServiceCallable } from "@bettercorp/service-base";
import { IncomingHttpHeaders } from "http";
import * as WEBSOCKET from "ws";

export interface WSServerOnEvents extends ServiceCallable {
  onConnection(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: Boolean | IToken,
    session: string | null,
    headers: IncomingHttpHeaders
  ): Promise<void>;
  onConnectionClose(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: Boolean | IToken,
    session: string | null,
    headers: IncomingHttpHeaders
  ): Promise<void>;
  onConnectionAuthChanged(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: Boolean | IToken,
    session: string | null,
    headers: IncomingHttpHeaders
  ): Promise<void>;
  onForcedDisconnect(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: Boolean | IToken,
    session: string | null,
    headers: IncomingHttpHeaders
  ): Promise<void>;
  onConnectionCheckin(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    connectionId: string,
    session: string | null,
    token: string | null
  ): Promise<void>;
  onReceive(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: false | IToken,
    session: string | null,
    action: string,
    data: any
  ): Promise<void>;
  onLog(
    serverId: string, // normally not required, but we will include the server id for multi-server mode
    clientIP: string,
    connectionId: string,
    token: false | IToken,
    session: string | null,
    log: string
  ): Promise<void>;
}
export interface WSServerOnReturnableEvents extends ServiceCallable {
  getConnectedSessions(): Promise<Array<string>>;
  send(
    connectionId: string,
    action: WSClientSpecialActions | string,
    data: any
  ): Promise<void>;
  forceDisconnect(
    connectionIds: Array<string> | string,
    reason: string
  ): Promise<void>;
}
export interface WSServerOnEmitReturnableEvents extends ServiceCallable {
  onAuth(
    serverId: string,
    connectionId: string,
    session: string | null,
    token: string | null,
    clientIP: string | null
  ): Promise<false | IToken>;
}

export interface IToken {
  sub: string;
}

export interface IPWebSocket extends WEBSOCKET {
  token: Boolean | IToken;
  tokenData: string | null;
  session: string | null;
  connectionId: string;
}

// @ts-ignore
export interface IPWebSocketServer extends WEBSOCKET.Server {
  clients: Set<IPWebSocket>;
}

export enum WSClientSpecialActions {
  auth = "auth",
  ping = "ping",
  log = "log",
}

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
  serverId: string;
  clientIP?: string;
}

export enum WSServer_Mode {
  "single" = "single",
  "multi" = "multi",
  "generic" = "generic",
}

export interface WSEvent<T = any> {
  action: string;
  data: T;
  auth?: string;
}

export interface WSClientEmitAREvents extends ServiceCallable {
  send(action: string, data: any): Promise<void>;
}
export interface WSClientOnEvents extends ServiceCallable {
  receive(action: string, data: any): Promise<void>;
  status(status: boolean): Promise<void>;
}
