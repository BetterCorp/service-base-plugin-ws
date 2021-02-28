export default (pluginName: string) => {
  return {
    port: 8081,
    forceAuthenticate: false,
    notifyClientOnNoAuth: false
  };
}