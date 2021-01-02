// Validate the configuration
const config = require('./utils/config');
if (typeof config.host === 'undefined') {
  console.error(new Error(`'HOST' environment variable must be defined`));
  process.exit(2);
}

// Make SSL certs (I don't check to see if they already exist in case the hostname has changed and so it's less likely they will expire)
const execSync = require('child_process').execSync;
console.log('[....] Creating SSL certificates...');
execSync('mkdir -p /etc/ssl');
execSync(`openssl req -x509 -newkey rsa:4096 -keyout /etc/ssl/key.pem -out /etc/ssl/cert.pem -days 365 -nodes  -subj "/C=NA/ST=NA/L=NA/O=NA/CN=${config.host}"`);
execSync('service nginx restart');
console.log('[DONE] Creating SSL certificates');

// Make the server response to the weatherstation query
const tzFormat = new Intl.NumberFormat('en-us', {
  minimumIntegerDigits: 2,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const response = JSON.stringify({
  timezone: tzFormat.format(new Date().getTimezoneOffset() / -60)
});

// Helper functions for converting to metric
const fToC = (v) => Math.round((v - 32) * 50 / 9) / 10; // Farenheit to Celsius
const mphToKmh = (v) => Math.round(v * 1.60934); // Miles per hour to Kilometers per hour
const inToMm = (v) => Math.round(v * 25.4); // inches to millimeters
const inToPa = (v) => Math.round(v * 3386); // inches of mercury to pascals
const keysToConvert = {
  barom: inToPa,
  temp: fToC,
  dewpt: fToC,
  windchill: fToC,
  heatindex: fToC,
  feelslike: fToC,
  dailyrain: inToMm,
  rain: inToMm,
  windgust: mphToKmh,
  windspeed: mphToKmh,
  windspeedavg: mphToKmh
};

// Mapping defining renaming keys (to remove units)
const keysToRename = {
  baromin: 'barom',
  tempf: 'temp',
  dewptf: 'dewpt',
  dailyrainin: 'dailyrain',
  rainin: 'rain',
  windgustmph: 'windgust',
  windspeedmph: 'windspeed',
  windspeedavgmph: 'windspeedavg'
};

// Create the callback function used to handle calls to the server
const http = require('http');
const URL = require('url').URL;
const influxdb = require('./utils/influxdb');

let lastSeen = {};
let last10Reqs = [];
function onRequest(clientReq, clientRes) {
  // Respond with the devices and when we last saw them at the root URL
  if (clientReq.url === '/') {
    const responseText = JSON.stringify({
      lastSeen,
      last10Reqs
    });
    clientRes.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': responseText.length,
      'Access-Control-Allow-Origin': '*'
    });
    clientRes.write(responseText);
    clientRes.end();
    return;
  }

  // Respond with nothing for favicon
  if (clientReq.url === '/favicon.ico') {
    clientRes.writeHead(404, {
      'Content-Length': 3
    });
    clientRes.write('404');
    clientRes.end();
    return;
  }

  // Add to the last 10 requests
  last10Reqs.push(clientReq.url);
  last10Reqs = last10Reqs.slice(-10);

  // Send on to AcuRite (if configured)
  if (config.acurite.forward) {
    const options = {
      hostname: 'atlasapi.myacurite.com',
      port: 80,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers
    };
    const acuriteReq = http.request(options);
    acuriteReq.on('error', console.error);
    clientReq.pipe(acuriteReq, {
      end: true
    });
  }

  // Respond with the timezone information
  clientRes.writeHead(200, {
    'Content-Type': 'application.json',
    'Content-Length': response.length,
    'Access-Control-Allow-Origin': '*'
  });
  clientRes.write(response);
  clientRes.end();

  // Pull the parameters out of the URL
  const url = new URL(`https://atlasapi.myacurite.com${clientReq.url}`);
  const params = {};
  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }

  // Round the time to the nearest minute
  params.dateutc = Math.round(new Date(`${params.dateutc}Z`).getTime() / 60000) * 60000;

  // Parse the parameters
  Object.keys(params)
    .forEach((key) => {
      const float = parseFloat(params[key]);
      if (!isNaN(float) && /^-?\d+(\.\d+|)$/.test(params[key])) {
        // If it is a number, parse it into a numbeer
        params[key] = float;
      } else if (params[key] === '') {
        // If it is an empty string, delete it
        delete params[key];
      } else if (key !== 'mt') {
        // If it isn't a number or an empty string put it in quotes (unless it is `mt`)
        params[key] = `"${params[key]}"`;
      }
    });

  // Rename the parameters
  Object.keys(params)
    .forEach((key) => {
      if (typeof keysToRename[key] !== 'undefined') {
        params[keysToRename[key]] = params[key];
        delete params[key];
      }
    });

  // Convert the parameters (if needed)
  if (config.celsius) {
    Object.keys(keysToConvert)
      .forEach((key) => {
        if (typeof params[key] !== 'undefined') {
          params[key] = keysToConvert[key](params[key]);
        }
      });
  }

  // Create the data and tags
  const {
    sensor,
    mt,
    dateutc,
    ...data
  } = params;

  // Exit early if there isn't a definition for any of the tags
  if (
    typeof sensor === 'undefined' ||
    typeof mt === 'undefined' ||
    typeof dateutc === 'undefined'
  ) {
    return;
  }

  // Log the sensor reading
  console.log(`New reading from ${mt}:${sensor} at ${dateutc}`);

  // Record in the object
  lastSeen[sensor] = lastSeen[sensor] || {};
  lastSeen[sensor][mt] = dateutc;

  // Send to InfluxDB (if configured)
  influxdb.sendMetrics(
    dateutc,
    {
      sensor,
      mt
    },
    data
  );

  // Send to MQTT (if configured)
}

// Set up the InfluxDB and MQTT connections and start the server
Promise.all([
  influxdb.checkAndCreateDatabase()
])
  .then(() => {
    http.createServer(onRequest)
      .listen(80);
    console.log('Listening on port 80');
  });

// Look for AcuRites and push the new host to them
const fetch = require('node-fetch');
config.acurite.ips
  .forEach((ip) => fetch(`http://${ip}/`)
    .then((r) => r.text())
    .then((html) => html.match(/\$\('txtSer'\)\.value = '([^']+)'/)[1])
    .then((currentHost) => {
      if (currentHost === config.host) {
        console.log(`Access IP ${ip} already has host ${config.host}`);
        return;
      }

      console.log(`Access IP ${ip} had host ${currentHost}, changing to ${config.host}`);
      return fetch(`http://${ip}/config.cgi`, {
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST',
        body: `ser=${config.host}`
      })
        .then((r) => r.text());
    })
    .catch((e) => {
      console.error(`Error with Acurite Access ${ip}:`);
      console.error(e);
    }));
