import * as WEBSOCKET from 'ws';

export enum WSServerEvents {
  onConnection = 'on-connection',
  onConnectionClose = 'on-connection-close',
  onConnectionAuthChanged = 'on-connection-auth',
  forceDisconnect = 'force-disconnect',
  onForcedDisconnect = 'forced-disconnect',
  onConnectionCheckin = 'on-connection-checked-in',
  auth = 'auth',
  receive = 'receive',
  send = 'send',
  getConnectedSessions = 'get-connected-sessions'
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