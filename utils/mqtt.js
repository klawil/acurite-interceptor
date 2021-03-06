const mqtt = require('mqtt');
const config = require('./config');

const mesaurements = {
  temp: config.celsius ? '°C' : '°F',
  pressure: config.celsius ? 'pa' : 'inHg',
  length: config.celsius ? 'mm' : 'in',
  speed: config.celsius ? 'kmh' : 'mph',
  distance: config.celsius ? 'km' : 'mi'
};

const configurations = {
  barom: {
    device_class: 'pressure',
    name: 'Barometric Pressure',
    unit_of_measurement: mesaurements.pressure
  },
  dailyrain: {
    name: 'Daily Rain',
    unit_of_measurement: mesaurements.length
  },
  dewpt: {
    device_class: 'temperature',
    name: 'Dewpoint',
    unit_of_measurement: mesaurements.temp
  },
  feelslike: {
    device_class: 'temperature',
    name: 'Feels Like',
    unit_of_measurement: mesaurements.temp
  },
  heatindex: {
    device_class: 'temperature',
    name: 'Heat Index',
    unit_of_measurement: mesaurements.temp
  },
  humidity: {
    device_class: 'humidity',
    name: 'Humidity',
    unit_of_measurement: '%'
  },
  last_strike_ts: {
    name: 'Lightning Last Time',
    device_class: 'timestamp',
    unit_of_measurement: 'ISO8601'
  },
  last_strike_distance: {
    name: 'Lightning Last Distance',
    unit_of_measurement: mesaurements.distance
  },
  lightintensity: {
    device_class: 'illuminance',
    name: 'Light Intensity',
    unit_of_measurement: 'lx'
  },
  measured_light_seconds: {
    name: 'Light Seconds',
    unit_of_measurement: 's'
  },
  rain: {
    name: 'Rain Rate',
    unit_of_measurement: mesaurements.length
  },
  rssi: {
    device_class: 'signal_strength',
    name: 'Signal Strength',
    unit_of_measurement: 'rssi'
  },
  strikecount: {
    name: 'Lightning Strikes'
  },
  temp: {
    device_class: 'temperature',
    name: 'Temperature',
    unit_of_measurement: mesaurements.temp
  },
  uvindex: {
    name: 'UV Index'
  },
  windchill: {
    device_class: 'temperature',
    name: 'Wind Chill',
    unit_of_measurement: mesaurements.temp
  },
  winddir: {
    name: 'Wind Direction'
  },
  windgust: {
    name: 'Wind Gust',
    unit_of_measurement: mesaurements.speed
  },
  windgustdir: {
    name: 'Wind Direction (Gust)'
  },
  windspeed: {
    name: 'Wind Speed',
    unit_of_measurement: mesaurements.speed
  },
  windspeedavg: {
    name: 'Wind Speed (Avg)',
    unit_of_measurement: mesaurements.speed
  }
};

let client = null;
let sentConfig = [];
let sendConfigs = [];

let lastReadings = {};

if (config.mqtt.enabled) {
  console.log('Connecting to MQTT');
  client = mqtt.connect(config.mqtt.url);
  client.on('connect', () => {
    console.log('Connected to MQTT');
  });

  client.subscribe('hass/status', () => {
    console.log('Subscribed to HASS topic');
  });

  client.on('message', (topic, message) => {
    if (topic === 'hass/status' && message.toString() === 'online') {
      console.log('Sending configuration messages');
      sendConfigs.forEach((f) => f());
      Object.keys(lastReadings).forEach((key) => lastReadings[key]());
      return;
    }
  });
}

function sendMetrics(attributes, values) {
  if (!config.mqtt.enabled) {
    console.log('MQTT Not Enabled');
    return;
  }

  let baseTopic = config.mqtt.topic.replace(/\{(sensor|mt)\}/g, (a, name) => attributes[name] || 'NA');

  if (sentConfig.indexOf(baseTopic) === -1) {
    console.log('Publishing Configuration Topics');
    sentConfig.push(baseTopic);
    let sendConfig = () => {
      Object.keys(values)
        .filter((key) => typeof configurations[key] !== 'undefined')
        .forEach((key) => {
          let config = {
            ...configurations[key]
          };
          config.name = `${attributes.mt} ${config.name}`;
          config.state_topic = `${baseTopic}/state`;
          config.value_template = `{{ value_json.${key} }}`;

          client.publish(`${baseTopic}${key}/config`, JSON.stringify(config));
        });
    };
    sendConfig();
    sendConfigs.push(sendConfig);
  }

  // Make the timestamp ISO8601 compliant
  values = {
    ...values
  };
  if (typeof values.last_strike_ts !== 'undefined') {
    values.last_strike_ts = values.last_strike_ts.replace(/"/g, '') + 'Z';
  }

  lastReadings[baseTopic] = () => {
    client.publish(`${baseTopic}/state`, JSON.stringify(values));
  };
  lastReadings[baseTopic]();
}

module.exports = {
  sendMetrics
};