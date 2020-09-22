const OS = require( 'os' );

exports.default = ( jsonConfig ) => {
  jsonConfig.plugins = jsonConfig.plugins || {};
  jsonConfig.plugins.ws = jsonConfig.plugins.ws || {};
  jsonConfig.plugins.ws.endpoint = jsonConfig.plugins.ws.endpoint || "wss://localhost";
  jsonConfig.plugins.ws.identity = jsonConfig.plugins.ws.identity || OS.hostname() || Math.random().toString( 36 ).substring( 2, 15 ) + Math.random().toString( 36 ).substring( 2, 15 );

  return jsonConfig;
}