import * as WEBSOCKET from 'ws';
import * as http from 'http';

export enum WSServerEvents {
  onConnection = 'on-connection',
  onConnectionClose = 'on-connection-close',
  onConnectionAuthChanged = 'on-connection-auth',
  forceDisconnect = 'force-disconnect',
  auth = 'auth',
  receive = 'receive',
  send = 'send',
}

export interface IToken {
  "allowed-origins": string,
  "resource_access": string,
  scope: string,
  address: string,
  email_verified: string,
  name: string,
  preferred_username: string,
  given_name: string,
  family_name: string,
  email: string,
  crmid: string,
  //token: string,
  _atui?: boolean;
}

export interface IPWebSocket extends WEBSOCKET {
  token: Boolean | IToken;
  tokenData: string | null;
  session: string | null;
  connectionId: string;
}

// @ts-ignore
export interface IPWebSocketServer extends WEBSOCKET.Server {
  on (event: 'connection', cb: (this: WEBSOCKET.Server, socket: IPWebSocket, request: http.IncomingMessage) => void): this;
  clients: Set<IPWebSocket>;
}

export interface WSServerData {
  action: WSClientSpecialActions | string,
  data?: any
  auth?: any
  connectionId?: any
}
export enum WSClientSpecialActions {
  auth = 'auth',
  ping = 'ping',
  log = 'log'
}