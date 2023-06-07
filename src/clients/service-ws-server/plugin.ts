import {
  ServiceCallable,
  ServicesBase,
  ServicesClient,
} from "@bettercorp/service-base";
import {
  WSServerOnEvents,
  WSServerOnReturnableEvents,
  WSServerOnEmitReturnableEvents,
  IToken,
  WSClientSpecialActions,
  WSServerMode,
  WSServerTiedCallableMethods,
} from "../../";
import { IncomingHttpHeaders } from "http";

export class wsServer<
  ServerMode extends WSServerMode,
  T extends ServerMode
> extends ServicesClient<
  ServiceCallable,
  WSServerOnEvents,
  WSServerOnReturnableEvents,
  WSServerOnEmitReturnableEvents,
  WSServerTiedCallableMethods
> {
  private _serverMode: ServerMode;
  private _serverId: string = "default";
  private _getServerIdFromTiedInstance: boolean = false;
  public override initAfterPlugins: Array<string> = [];
  public readonly _pluginName: string = "service-ws-server";
  public constructor(
    self: ServicesBase<any, any, any>,
    serverMode: T,
    serverId?: T extends "tied-single" ? never : string
  ) {
    super(self);
    if (serverMode === WSServerMode.tied) {
      this.initAfterPlugins.push("service-ws-server");
      this._serverMode = WSServerMode.single as ServerMode;
      this._getServerIdFromTiedInstance = true;
    } else {
      this._serverMode = serverMode as ServerMode;
      if (typeof serverId === "string") this._serverId = serverId;
    }
  }
  public override async _register(): Promise<void> {
    await this._register();
    if (this._getServerIdFromTiedInstance)
      this._serverId = await this._plugin.callPluginMethod("getServerId");
  }

  public get serverId() {
    return this._serverId;
  }
  public set serverId(serverId: string) {
    if (
      this._serverMode === WSServerMode.generic ||
      this._serverMode === WSServerMode.tied
    )
      throw new Error("Cannot set serverId in " + this._serverMode + " mode");
    this._serverId = serverId;
  }

  public async onConnection(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      headers: IncomingHttpHeaders
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onConnection",
        listener
      );
    return await this._plugin.onEvent("onConnection", listener);
  }
  public async onConnectionClose(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      headers: IncomingHttpHeaders
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onConnectionClose",
        listener
      );
    return await this._plugin.onEvent("onConnectionClose", listener);
  }
  public async onConnectionAuthChanged(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      headers: IncomingHttpHeaders
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onConnectionAuthChanged",
        listener
      );
    return await this._plugin.onEvent("onConnectionAuthChanged", listener);
  }
  public async onForcedDisconnect(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      headers: IncomingHttpHeaders
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onForcedDisconnect",
        listener
      );
    return await this._plugin.onEvent("onForcedDisconnect", listener);
  }
  public async onConnectionCheckin(
    listener: (
      serverId: string,
      connectionId: string,
      session: string | null,
      token: string | null
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onConnectionCheckin",
        listener
      );
    return await this._plugin.onEvent("onConnectionCheckin", listener);
  }
  public async onReceive(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      action: string,
      data: any
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onReceive",
        listener
      );
    return await this._plugin.onEvent("onReceive", listener);
  }
  public async onLog(
    listener: (
      serverId: string,
      clientIP: string,
      connectionId: string,
      token: Boolean | IToken,
      session: string | null,
      log: string
    ) => Promise<void>,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onEventSpecific(
        serverId ?? this._serverId,
        "onLog",
        listener
      );
    return await this._plugin.onEvent("onLog", listener);
  }

  public async getConnectedSessions(serverId?: string): Promise<Array<string>> {
    if (this._serverMode !== WSServerMode.generic)
      return await this._plugin.emitEventAndReturnSpecific(
        serverId ?? this._serverId,
        "getConnectedSessions"
      );
    return await this._plugin.emitEventAndReturn("getConnectedSessions");
  }
  public async send(
    connectionId: string,
    action: WSClientSpecialActions | string,
    data: any,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode !== WSServerMode.generic)
      return await this._plugin.emitEventAndReturnSpecific(
        serverId ?? this._serverId,
        "send",
        connectionId,
        action,
        data
      );
    return await this._plugin.emitEventAndReturn(
      "send",
      connectionId,
      action,
      data
    );
  }
  public async forceDisconnect(
    connectionIds: Array<string> | string,
    reason: string,
    serverId?: string
  ): Promise<void> {
    if (this._serverMode !== WSServerMode.generic)
      return await this._plugin.emitEventAndReturnSpecific(
        serverId ?? this._serverId,
        "forceDisconnect",
        connectionIds,
        reason
      );
    return await this._plugin.emitEventAndReturn(
      "forceDisconnect",
      connectionIds,
      reason
    );
  }
  public async onAuth(
    listener: (
      serverId: string,
      connectionId: string,
      session: string | null,
      token: string | null,
      clientIP: string | null
    ) => Promise<false | IToken>
  ): Promise<void> {
    if (this._serverMode === WSServerMode.single)
      return await this._plugin.onReturnableEventSpecific(
        this._serverId,
        "onAuth",
        listener
      );
    return await this._plugin.onReturnableEvent("onAuth", listener);
  }
}
