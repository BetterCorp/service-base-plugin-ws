const OS = require( 'os' );

exports.default = ( jsonConfig, pluginName ) => {
  const identity = OS.hostname() || Math.random().toString( 36 ).substring( 2, 15 ) + Math.random().toString( 36 ).substring( 2, 15 );
  jsonConfig.identity = jsonConfig.identity || identity;
  jsonConfig.plugins = jsonConfig.plugins || {};
  jsonConfig.plugins[pluginName] = jsonConfig.plugins[pluginName] || {};
  jsonConfig.plugins[pluginName].endpoint = jsonConfig.plugins[pluginName].endpoint || "ws://localhost";
  jsonConfig.plugins[pluginName].identity = jsonConfig.plugins[pluginName].identity || identity;

  return jsonConfig;
}