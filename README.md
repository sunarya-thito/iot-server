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
- `queries` - Map of endpoints
  - `{endpoint}` - The name of the endpoint.
    - `query` - The query to execute.
    - `serializer` - The serializer to use. (Optional)
    - `validators` - The validators to use. (Optional)
      - `{field name}` - The function to validate specific field value
- `secret` - The secret API key.
- `payloadType` - The type of the payload. The following types are available:
    - `json` - A JSON payload.

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

## Example Code
```javascript
import startServer from "./iot-server.js";

startServer(
    {
        // Port yang digunakan untuk mengakses server
        serverPort: 80,
        // Konfigurasi database
        database: {
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            name: 'iot',
            user: 'root',
            password: '',
            table: 'tb_cuaca',
            date_field: 'ts',
        },
        // Membatasi jumlah request yang dapat dilakukan dalam satu waktu
        // Jika melebihi batas, maka request akan ditolak
        // (dalam milidetik)
        rateLimit: 10000,
        allowAlterTable: false,
        // Berisi daftar fields yang ada pada tabel
        fields: [
            {
                // Nama field
                name: 'suhu',
                // Tipe data field
                type: 'float',
            },
            {
                name: 'humid',
                type: 'float',
            },
            {
                name: 'lux',
                type: 'float',
            },
        ],
        // Endpoint yang dapat diakses
        queries: {
            // Endpoint senddata (Contoh: http://localhost:8080/senddata?temp=20&humid=30&light=40)
            senddata: {
                query: 'INSERT INTO {table}(suhu, kelembapan, lux) VALUES ({temp}, {humid}, {light})',
                serializer: results => {
                    return results.length;
                },
                validators: {
                    suhu: value => {
                        return value >= 0 && value <= 100;
                    }
                }
            },
            // Endpoint getdata (Contoh: http://localhost:8080/getdata)
            getalldata: 'SELECT * FROM {table}',
            getlatestdata: 'SELECT * FROM {table} ORDER BY date DESC LIMIT 1',
            gethottestdate: 'SELECT {date} FROM {table} WHERE suhu = (SELECT MAX(suhu) FROM {table}) GROUP BY {date}',
        },
        secret: ip => {
            switch (ip) {
                // Jika diakses dari localhost, maka tidak perlu secret
                case '127.0.0.1':
                    return null;
                default:
                    // Jika diakses dari luar, maka secret adalah string berikut
                    return 'abcdefghijklmnopqrstuvwxyz';
            }
        },
        // Payload yang akan dikirimkan ke client
        payloadType: 'text',
    }
);
```