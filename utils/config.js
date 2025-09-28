const config = {
  influxdb: {
    enabled: typeof process.env.INFLUXDB_HOST === 'string',
    database: process.env.INFLUXDB_DATABASE || 'acurite',
    host: process.env.INFLUXDB_HOST
  },
  mqtt_old: {
    enabled: typeof process.env.MQTT_URL === 'string',
    url: process.env.MQTT_URL,
    topic: process.env.MQTT_BASE_TOPIC || 'homeassistant/sensor/{sensor}/{mt}'
  },
  mqtt: {
    enabled: true,
    url: 'mqtt://server.klawil.net:5004',
    topic: 'homeassistant/sensor/{sensor}/{mt}',
  },
  host: process.env.HOST,
  acurite: {
    forward: process.env.FORWARD_TO_ACURITE !== 'FALSE',
    ips: (process.env.ACURITE_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip))
  },
  celsius: process.env.UNITS !== 'F'
};

module.exports = config;
