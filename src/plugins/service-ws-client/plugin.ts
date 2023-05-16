import { WebSocket as WebSockets } from "ws";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { IWSClientPluginConfig } from "./sec.config";
import {
  ServicesBase,
  ServiceCallable,
  IPluginLogger,
} from "@bettercorp/service-base";
import { WSClientOnEvents, WSClientEmitAREvents, WSEvent } from "../../";

export class Service extends ServicesBase<
  ServiceCallable,
  WSClientOnEvents,
  WSClientEmitAREvents,
  ServiceCallable,
  ServiceCallable,
  IWSClientPluginConfig
> {
  private WebSocket!: WebSockets;
  private reconnectNum: number = 0;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
  }

  public override async init(): Promise<void> {
    const self = this;
    await self.reconnect();

    await self.onReturnableEvent("send", async (action, data) => {
      if (Tools.isNullOrUndefined(action)) return;
      if (Tools.isNullOrUndefined(action)) return;
      if (typeof action !== "string") return;

      if (Tools.isNullOrUndefined(self.WebSocket)) {
        throw "WS NOT CONNECTED YET";
      }
      try {
        self.WebSocket.send(
          JSON.stringify({
            action: data.action,
            data: data.data,
            auth: (await self.getPluginConfig()).token ?? null,
          })
        );
      } catch (exc: any) {
        await self.log.error(exc);
      }
    });
  }

  private async reconnect() {
    const self = this;
    const config = await self.getPluginConfig();
    await self.log.info("Reconnecting to {endpoint}", {
      endpoint: config.endpoint,
    });
    if (self.reconnectNum > 5) {
      await self.log.fatal(
        "Reconnect failed. Please check your config/server: [{endpoint}].",
        {
          endpoint: config.endpoint,
        }
      );
    }
    self.WebSocket = new WebSockets(config.endpoint, {
      perMessageDeflate: false,
    });
    self.WebSocket.on("error", async (e) => {
      await self.log.error(e);
      self.emitEvent("status", false);
    });
    self.WebSocket.on("close", async () => {
      await self.log.warn(
        "Connection to {endpoint} closed. Will try re-connect.",
        {
          endpoint: config.endpoint,
        }
      );
      await self.emitEvent("status", false);
      self.WebSocket.close();
      self.WebSocket.terminate();
      setTimeout(() => {
        self.reconnect();
      }, 5000);
    });
    self.reconnectNum++;
    self.WebSocket.on("open", async () => {
      self.reconnectNum = 0;
      await self.log.info("Connected to {endpoint}", {
        endpoint: config.endpoint,
      });
      self.WebSocket.send(
        JSON.stringify({
          action: "ws-auth",
          auth: config.token,
          data: {
            name: config.identity,
          },
        })
      );
      setTimeout(async () => {
        await self.emitEvent("status", self.WebSocket.readyState === 1);
      }, 5000);
    });

    self.WebSocket.on("message", async (data: string) => {
      let msg: WSEvent = JSON.parse(data);
      if (msg.action === "log") {
        return await self.log.info("[SERVER-LOG] {msg}", { msg: msg.data });
      }
      await self.log.debug("[SERVER-MSG] {msg}", { msg: data });
      if (Tools.isNullOrUndefined(msg.action)) return;
      if (Tools.isNullOrUndefined(msg.data)) return;
      await self.emitEvent("receive", msg.action, msg.data);
    });
  }
}
