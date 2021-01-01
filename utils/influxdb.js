const fetch = require('node-fetch');
const config = require('./config');

function checkAndCreateDatabase() {
  if (!config.influxdb.enabled) {
    console.log('InfluxDB not configured');
    return new Promise((res) => res());
  }

  console.log('Checking InfluxDB databases');
  return fetch(`${config.influxdb.host}/query?q=SHOW+DATABASES&db=_internal`)
    .then((r) => r.json())
    .then((data) => data.results[0].series[0].values
      .map((v) => v[0]))
    .then((databases) => {
      if (databases.indexOf(config.influxdb.database) !== -1) {
        console.log(`InfluxDB Database "${config.influxdb.database}" already exists`);
        return;
      }

      console.log(`InfluxDB Database "${config.influxdb.database}" does not exist (databases are ${databases.join(', ')})`);
      return fetch(`${config.influxdb.host}/query?q=CREATE+DATABASE+"${config.influxdb.database}"+WITH+DURATION+14d&db=_internal`)
        .then((r) => r.text());
    });
}

function sendMetrics(timestamp, attributes, values) {
  // Exit early if influxdb is not enabled
  if (!config.influxdb.enabled) {
    return;
  }

  // Build the string for the attributes
  let attributeString = Object.keys(attributes)
    .map((key) => `${key}=${attributes[key]}`);

  // Modify the timestamp for the influxDB format
  timestamp *= 1000 * 1000;

  // Bulid the body of the request to influxDB
  let requestBody = Object.keys(values)
    .map((key) => `${key},${attributeString} value=${values[key]} ${timestamp}`)
    .join('\n');

  // Make the request
  fetch(`${config.influxdb.host}/write?db=${config.influxdb.database}`, {
    body: requestBody,
    method: 'POST'
  })
    .then((r) => r.text());
}

module.exports = {
  checkAndCreateDatabase,
  sendMetrics
};
