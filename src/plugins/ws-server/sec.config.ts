export interface IWSServerPluginConfig {
  port: number;
  forceAuthenticate: boolean;
  notifyClientOnNoAuth: boolean;
}

export default (pluginName: string): IWSServerPluginConfig => {
  return {
    port: 8081,
    forceAuthenticate: false,
    notifyClientOnNoAuth: false
  };
}