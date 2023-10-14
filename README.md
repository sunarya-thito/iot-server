# iot-server
## Description
This is a simple server for IoT devices. It stores data from devices and provides a simple API for getting data.

## Installation
```bash
npm install iot-server
```

## Usage
```javascript
import startServer from "iot-server";

startServer(
    {
        serverPort: 8080,
        databaseType: 'mysql',
        database: {
            host: 'localhost',
            port: 3306,
            name: 'iot_database',
            user: 'root',
            password: '',
            table: 'iot_table'
        },
        rateLimit: 10000,
        fields: [
            {
                name: 'temperature',
                type: 'number',
            },
            {
                name: 'status',
                type: 'string',
            },
            {
                name: 'active',
                type: 'boolean',
            }
        ],
        secret: 'mysecretapikey123456789',
        payloadType: 'json',
        payloadLimit: 100,
    }
);
```

## Configuration
The server can be configured with the following options:
- `serverPort` - The port the server will listen on.
- `databaseType` - The type of database to use. Currently only `mysql` is supported.
- `database` - The database configuration. The following options are available:
    - `host` - The host of the database.
    - `port` - The port of the database.
    - `name` - The name of the database.
    - `user` - The user of the database.
    - `password` - The password of the database.
    - `table` - The name of the table to use.
- `rateLimit` - The rate limit for the API in milliseconds.
- `fields` - The fields that are allowed to be stored. The following options are available:
    - `name` - The name of the field.
    - `type` - The type of the field. The following types are available:
        - `number` - A number.
        - `string` - A string.
        - `boolean` - A boolean.
- `secret` - The secret API key.
- `payloadType` - The type of the payload. The following types are available:
    - `json` - A JSON payload.
- `payloadLimit` - The maximum number of payloads to return.

## API
The server provides the following API:
- `GET /` - Returns the current server status.
- `GET /status?secret=[SECRET KEY]&beforeDate=[DATE]&afterDate=[DATE]&maxQuery=[NUMBER]` - Returns the payload.
    - `secret` - The secret API key. (Optional if no secret is set)
    - `beforeDate` - The maximum date of the payload. (Optional)
    - `afterDate` - The minimum date of the payload. (Optional)
    - `maxQuery` - The maximum number of payloads to return. (Optional, default: 100)
- `GET /data?secret=[SECRET KEY]&<field name>=<field value>`
    - `secret` - The secret API key. (Optional if no secret is set)
    - `<field name>` - The name of the field.
    - `<field value>` - The value of the field.

### Response
The server will respond with the following status codes:
- `200` - The request was successful.
- `400` - The request was invalid.
- `401` - The request was unauthorized. (Invalid secret key)
- `429` - The request was rate limited.

The server will respond with the following payload:
- `status` - The status of the request.
- `data` - The data of the request. (For `GET /status`)
- `message` - The message of the request. (Nullable)

The server will respond with the following status:
- `success` - The request was successful.
- `fail` - The request failed.
- `access-denied` - The request was unauthorized.
- `rate-limited` - The request was rate limited.

Example response: 
```
{
  "status": "success",
  "data": [
    {
      "temperature": 20,
      "status": "working",
      "active": true,
      "date": "2020-01-01T00:00:00.000Z"
    },
    {
      "temperature": 20,
      "status": "working",
      "active": true,
      "date": "2020-01-01T00:00:00.000Z"
    }
  ],
  "message": "Successfully retrieved data."
}
```
    
### Example
```
http://localhost:3000/
```
```
http://localhost:3000/status?beforeDate=2020-01-01T00:00:00.000Z&afterDate=2020-01-01T00:00:00.000Z&maxQuery=100
```
```
http://localhost:3000/data?temperature=20&status=working&active=true
```