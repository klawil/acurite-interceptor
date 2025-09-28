const mqtt = require('mqtt');
const config = require('./config');

function replaceValuesInStrings(input, values) {
  if (typeof input === 'string') {
    return input.replace(/\{([a-zA-Z0-9]+)\}/g, (a, val) => {
      if (typeof values[val] === 'undefined') {
        console.error(`Invalid value - ${val} (input: ${input}, values: ${JSON.stringify(values)})`);
        return val;
      }

      return values[val];
    });
  }

  if (Array.isArray(input)) {
    return input.map(v => replaceValuesInStrings(v, values));
  }

  if (typeof input === 'object' && input !== null) {
    return Object.keys(input).reduce((agg, key) => {
      agg[key] = replaceValuesInStrings(input[key], values);
      return agg;
    }, {});
  }

  return input;
}

const baseConfigTopic = `homeassistant/sensor/{id}/{key}/config`;
const baseTopic = 'home'
const baseStateTopic = `${baseTopic}/{id}/state`;
const availTopic = `${baseTopic}/weather/status`;

const ONLINE = 'online';
const OFFLINE = 'offline';

const state = {
  availability: {
    payload_available: ONLINE,
    payload_not_available: OFFLINE,
    topic: availTopic,
  },
  device: {
    model: '{mt}',
    name: '{mt} Weather',
    sw_version: '1.0.0',
    manufacturer: 'Acurite',
    identifiers: [
      '{id}',
    ],
  },
  force_update: true,
  icon: 'mdi:thermometer',
  state_topic: baseStateTopic,
  unique_id: `{id}_state`,
};

const mesaurements = {
  temp: config.celsius ? '°C' : '°F',
  pressure: config.celsius ? 'pa' : 'inHg',
  length: config.celsius ? 'mm' : 'in',
  speed: config.celsius ? 'km/h' : 'mph',
  distance: config.celsius ? 'km' : 'mi'
};

const configurations = {
  barom: {
    ...state,
    name: 'Barometric Pressure',
    device_class: 'atmospheric_pressure',
    suggested_display_precision: 0,
    unit_of_measurement: mesaurements.pressure,
  },
  dailyrain: {
    ...state,
    name: 'Daily Rain',
    device_class: 'precipitation',
    unit_of_measurement: mesaurements.length,
  },
  dewpt: {
    ...state,
    device_class: 'temperature',
    name: 'Dewpoint',
    unit_of_measurement: mesaurements.temp
  },
  feelslike: {
    ...state,
    device_class: 'temperature',
    name: 'Feels Like',
    unit_of_measurement: mesaurements.temp
  },
  heatindex: {
    ...state,
    device_class: 'temperature',
    name: 'Heat Index',
    unit_of_measurement: mesaurements.temp
  },
  humidity: {
    ...state,
    device_class: 'humidity',
    name: 'Humidity',
    unit_of_measurement: '%'
  },
  last_strike_ts: {
    ...state,
    name: 'Lightning Last Time',
    device_class: 'timestamp',
  },
  last_strike_distance: {
    ...state,
    name: 'Lightning Last Distance',
    device_class: 'distance',
    unit_of_measurement: mesaurements.distance
  },
  lightintensity: {
    ...state,
    device_class: 'illuminance',
    name: 'Light Intensity',
    unit_of_measurement: 'lx'
  },
  measured_light_seconds: {
    ...state,
    name: 'Light Seconds',
    device_class: 'duration',
    unit_of_measurement: 's'
  },
  rain: {
    ...state,
    name: 'Rain Rate',
    device_class: 'precipitation',
    unit_of_measurement: mesaurements.length,
  },
  strikecount: {
    ...state,
    name: 'Lightning Strikes',
    unit_of_measurement: 'count',
    state_class: 'total_increasing',
  },
  temp: {
    ...state,
    device_class: 'temperature',
    name: 'Temperature',
    unit_of_measurement: mesaurements.temp
  },
  uvindex: {
    ...state,
    name: 'UV Index',
    unit_of_measurement: ' ',
  },
  windchill: {
    ...state,
    device_class: 'temperature',
    name: 'Wind Chill',
    unit_of_measurement: mesaurements.temp
  },
  winddir: {
    ...state,
    name: 'Wind Direction (degrees)',
    unit_of_measurement: '°',
  },
  windgust: {
    ...state,
    name: 'Wind Gust',
    device_class: 'wind_speed',
    unit_of_measurement: mesaurements.speed
  },
  windgustdir: {
    ...state,
    name: 'Wind Direction (Gust, degrees)',
    unit_of_measurement: '°',
  },
  winddir_str: {
    ...state,
    name: 'Wind Direction',
    device_class: 'enum',
  },
  windgustdir_str: {
    ...state,
    name: 'Wind Direction (Gust)',
    device_class: 'enum',
  },
  windspeed: {
    ...state,
    name: 'Wind Speed',
    device_class: 'wind_speed',
    unit_of_measurement: mesaurements.speed
  },
  windspeedavg: {
    ...state,
    name: 'Wind Speed (Avg)',
    device_class: 'wind_speed',
    unit_of_measurement: mesaurements.speed
  },
  rssi: {
    ...state,
    device_class: 'signal_strength',
    name: 'Signal Strength',
    entity_category: 'diagnostic',
    unit_of_measurement: 'rssi'
  },
  hubbattery: {
    ...state,
    name: 'Device Battery',
    entity_category: 'diagnostic',
  },
  sensorbattery: {
    ...state,
    name: 'Sensor Battery',
    entity_category: 'diagnostic',
  },
};

Object.keys(configurations).forEach(key => {
  configurations[key].unique_id = `{id}_${key}`;
  configurations[key].value_template = `{{ value_json.${key} }}`;
});

let client = null;
let sentConfig = [];

if (config.mqtt.enabled) {
  console.log('Connecting to MQTT');
  client = mqtt.connect(config.mqtt.url, {
    will: {
      topic: availTopic,
      payload: OFFLINE,
      retain: true,
    },
  });
  client.on('connect', () => {
    console.log('Connected to MQTT');
    client.publish(availTopic, ONLINE, { retain: true });
  });

  client.subscribe('hass/status', () => {
    console.log('Subscribed to HASS topic');
  });
}

function sendMetrics(attributes, values) {
  if (!config.mqtt.enabled) {
    console.log('MQTT Not Enabled');
    return;
  }

  if (sentConfig.indexOf(attributes.id) === -1) {
    console.log('Publishing Configuration Topics');
    sentConfig.push(attributes.id);
    Object.keys(configurations).forEach(configKey => {
      const configTopic = replaceValuesInStrings(baseConfigTopic, {
        ...attributes,
        key: configKey,
      });

      const payload = replaceValuesInStrings(configurations[configKey], attributes);

      client.publish(configTopic, JSON.stringify(payload), { retain: true });
    });
  }

  // Make the timestamp ISO8601 compliant
  values = {
    ...values
  };
  if (typeof values.last_strike_ts !== 'undefined') {
    values.last_strike_ts = values.last_strike_ts.replace(/"/g, '') + 'Z';
  }

  Object.keys(values)
    .filter(key => typeof configurations[key] === 'undefined')
    .forEach(key => delete values[key]);

  const stateTopic = replaceValuesInStrings(baseStateTopic, attributes);
  client.publish(stateTopic, JSON.stringify(values), { retain: true });
  client.publish(availTopic, ONLINE, { retain: true });
}

module.exports = {
  sendMetrics
};