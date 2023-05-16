import { SecConfig } from "@bettercorp/service-base";
export interface IWSServerPluginConfig {
  port: number;
  forceAuthenticate: boolean;
  notifyClientOnNoAuth: boolean;
  serverId: string | null;
  serverMode: "single" | "multi" | "generic"; // Server Mode: A single server will use the serverId for communication. Multi will use the plugin name for communicatin gevents and serverId to send messages to a specific server. Generic will only use the plugin name
}

export class Config extends SecConfig<IWSServerPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: IWSServerPluginConfig
  ): IWSServerPluginConfig {
    return {
      serverMode: existingConfig.serverMode ?? "multi",
      port: existingConfig.port ?? 8081,
      serverId: existingConfig.serverId ?? null,
      forceAuthenticate: existingConfig.forceAuthenticate ?? false,
      notifyClientOnNoAuth: existingConfig.notifyClientOnNoAuth ?? false,
    };
  }
}
