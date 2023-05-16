import {
  ServiceCallable,
  ServicesBase,
  ServicesClient,
} from "@bettercorp/service-base";
import { WSClientEmitAREvents, WSClientOnEvents } from "../../";
import { EventEmitter } from "stream";

enum EmitLocal {
  unknown,
  yes,
  no,
}
export class wsClient extends ServicesClient<
  ServiceCallable,
  WSClientOnEvents,
  WSClientEmitAREvents,
  ServiceCallable,
  ServiceCallable
> {
  private _localEmitter: EventEmitter;
  private _emittingLocally: EmitLocal = EmitLocal.unknown;
  public readonly _pluginName: string = "service-ws-client";
  public constructor(self: ServicesBase<any, any, any>) {
    super(self);
    this._localEmitter = new EventEmitter();
  }

  public async onStatus(
    listener: (status: boolean) => Promise<void>
  ): Promise<void> {
    await this._plugin.onEvent("status", listener);
  }

  public async onMessage(
    listener: (action: string, data: any) => Promise<void>
  ): Promise<void> {
    if (this._emittingLocally === EmitLocal.yes)
      throw 'Cannot listen to "message" while emitting locally - listen to each action individually';
    this._emittingLocally = EmitLocal.no;
    await this._plugin.onEvent("receive", listener);
  }
  public async onAction(
    action: string,
    listener: (data: any) => Promise<void>
  ): Promise<void> {
    if (this._emittingLocally === EmitLocal.no)
      throw 'Cannot listen to "action" while not emitting locally - listen to onMessage or remove onMessage listener';
    if (this._emittingLocally === EmitLocal.unknown) {
      const self = this;
      await this._plugin.onEvent("receive", async (action, data) => {
        self._localEmitter.emit(action, data);
        if (self._localEmitter.listenerCount(action) === 0) {
          await self._plugin.log.warn('No listener for action "{action}"', {
            action,
          });
        }
      });
      this._emittingLocally = EmitLocal.yes;
    }
    this._localEmitter.on(action, listener);
  }
}
