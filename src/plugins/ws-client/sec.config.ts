import * as os from 'os';

export interface IWSClientPluginConfig {
  endpoint: string;
  token: string | null;
  identity: string | null;
}

export default (pluginName: string): IWSClientPluginConfig => {
  return {
    endpoint: "ws://localhost/ws",
    token: null,
    identity: os.hostname()
  };
};