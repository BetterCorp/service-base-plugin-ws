import * as os from 'os';
import { SecConfig } from "@bettercorp/service-base";

export interface IWSClientPluginConfig {
  endpoint: string;
  token: string | null;
  identity: string | null;
}

export class Config extends SecConfig<IWSClientPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: IWSClientPluginConfig
  ): IWSClientPluginConfig {
    return {
      endpoint: existingConfig.endpoint ?? "ws://localhost/ws",
      token: existingConfig.token ?? null,
      identity: existingConfig.identity ?? os.hostname()
    }
  }
}