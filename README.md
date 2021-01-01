# Acurite Interceptor Docker Container

# NOTE: MQTT support has not yet been added, currently this image only works for InfluxDB but MQTT will be added in a future update

This docker container spins up a server on port 443 that Acurite Access devices can connect and
send data to. When a device connects to the server, it can send the data up to 3 places: My Acurite, an
InfluxDB server, and a MQTT server.

## Docker Configuration

I have included a sample `docker-compose` file (I'm not good at regular docker so I'll leave it to you to create the appropriate commands).

## Getting Started

1. Download the `docker-compose.yml` hosted in this repo
2. Edit the `docker-compose.yml` `environment` section based on the descriptions below
3. Run `docker-compose up -d` to start the service
4. To see logs, run `docker container logs -f acurite-interceptor`

When the service starts, 4 things should happen:
- Self-signed SSL certificates will be generated for the `HOST` value provided
- (If InfluxDB is configured) InfluxDB will be checked for the database and if it doesn't exist it will be created with a retention policy of 30 days
- A server will start on port 443 accepting connections from Acurite Access devices
- Each Acurite Access IP in the environment variable will be checked to ensure it is pointing at `HOST` and if it isn't the `Server Name` field will be updated

## Environment Options

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| HOST | Yes |  | The string Acurite Access will use to connect to this service (ip or FQDN) |
| FORWARD_TO_ACURITE | No | `TRUE` | Set to `FALSE` to not send data to My Acurite |
| ACURITE_IPS | No |  | A comma-separated list of IPs of Acurite Access devices. This will be used to set the `Server Name` to `HOST` for each device |
| UNITS | No | `C` | Set to `F` to use imperial units, defaults to metric |

### InfluxDB Options

Use these to set up InfluxDB.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| INFLUXDB_HOST | Yes |  | The host used to connect to InfluxDB. Should be `http://{Hostname}:{Port}` |
| INFLUXDB_DATABASE | No | `acurite` | The database the data will be inserted into |
