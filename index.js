import express from 'express';
import mysql from "mysql";

const VERSION = '1.0.14';
const STATUS_SUCCESS = 'success';
const STATUS_FAILED = 'failed';
const STATUS_ACCESS_DENIED = 'access-denied';
const STATUS_RATE_LIMITED = 'rate-limited';

const STATUS_CODE_SUCCESS = 200;
const STATUS_CODE_FAILED = 400;
const STATUS_CODE_ACCESS_DENIED = 401;
const STATUS_CODE_RATE_LIMITED = 429;

const PRESERVED_FIELD_NAMES = ['id', 'date'];

const FIELD_TYPE_MAPPING = {
    'string': {
        'type': 'VARCHAR',
        'length': 255,
        validate: (value) => {
            return typeof value === 'string';
        }
    },
    'number': {
        'type': 'DOUBLE',
        validate: (value) => {
            value = parseInt(value);
            return !isNaN(value);
        }
    },
    'boolean': {
        'type': 'BOOLEAN',
        validate: (value) => {
            return typeof value === 'boolean' || value === 'true' || value === 'false';
        }
    },
}
function createDatabasePreparedStatements(fields, table) {
    let queryBuilder = `INSERT INTO ${table} (`;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        queryBuilder += field;
        if (i !== fields.length - 1) {
            queryBuilder += ', ';
        }
    }
    queryBuilder += ', date) VALUES (';
    for (let i = 0; i < fields.length; i++) {
        queryBuilder += '?';
        if (i !== fields.length - 1) {
            queryBuilder += ', ';
        }
    }
    queryBuilder += ', NOW())';
    return queryBuilder;
}

function createTableGetFieldInfoBuilder(table) {
    // get field info (name and type)
    return `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`;
    // this will return array of object
    // with:
    // COLUMN_NAME: name of the column
    // DATA_TYPE: type of the column
}

function createAlterFieldsBuilder(fields, databaseFields, table) {
    // fields contains
    let queryBuilder = '';
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let name = field.name;
        let type = field.type;
        let found = false;
        for (let j = 0; j < databaseFields.length; j++) {
            let databaseField = databaseFields[j];
            if (databaseField.COLUMN_NAME === name) {
                found = true;
                break;
            }
        }
        if (!found) {
            // add field
            let mappedType = FIELD_TYPE_MAPPING[type];
            if (!mappedType) {
                throw new Error('Invalid field type: ' + type);
            }
            queryBuilder += `ALTER TABLE ${table} ADD ${name} ${mappedType.type};`;
        } else {
            // check if type is same
            let mappedType = FIELD_TYPE_MAPPING[type];
            if (!mappedType) {
                throw new Error('Invalid field type: ' + type);
            }
            if (mappedType.type !== databaseFields[i].DATA_TYPE || mappedType.length !== databaseFields[i].CHARACTER_MAXIMUM_LENGTH) {
                if (mappedType.length) {
                    queryBuilder += `ALTER TABLE ${table} MODIFY ${name} ${mappedType.type}(${mappedType.length});`;
                } else {
                    queryBuilder += `ALTER TABLE ${table} MODIFY ${name} ${mappedType.type};`;
                }
            }
        }
    }
    // check if there is field to be removed
    for (let i = 0; i < databaseFields.length; i++) {
        let databaseField = databaseFields[i];
        if (PRESERVED_FIELD_NAMES.indexOf(databaseField.COLUMN_NAME) !== -1) {
            continue;
        }
        let found = false;
        for (let j = 0; j < fields.length; j++) {
            let field = fields[j];
            if (databaseField.COLUMN_NAME === field.name) {
                found = true;
                break;
            }
        }
        if (!found) {
            // remove field
            queryBuilder += `ALTER TABLE ${table} DROP COLUMN ${databaseField.COLUMN_NAME};`;
        }
    }
    if (queryBuilder.length > 0) {
        return queryBuilder;
    }
}

function createDatabaseTableBuilder(fields, table) {
    let queryBuilder = `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY`;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let name = field.name;
        let type = field.type;
        queryBuilder += ', ';
        let mappedType = FIELD_TYPE_MAPPING[type];
        if (!mappedType) {
            throw new Error('Invalid field type: ' + type);
        }
        // queryBuilder += `${name} ${mappedType}`;
        if (mappedType.length) {
            queryBuilder += `${name} ${mappedType.type}(${mappedType.length})`;
        } else {
            queryBuilder += `${name} ${mappedType.type}`;
        }
    }
    // add date field
    queryBuilder += ', date DATETIME)';
    return queryBuilder;
}

function createTableCheckBuilder(table) {
    return `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${table}'`;
}

function createDatabaseConnection(databaseType = 'mysql', {
    host = 'localhost',
    port = 3306,
    name = 'iot',
    user = 'root',
    password = '',
    table = 'data'
}) {
    switch (databaseType) {
        case 'mysql':
            const connection = mysql.createConnection({
                host: host,
                port: port,
                database: name,
                user: user,
                password: password,
                multipleStatements: true,
            });

            return {
                initialize: (fields) => {
                    connection.query('SELECT 1 + 1 AS solution', (error, results, cb) => {
                        if (error) {
                            throw error;
                        }
                    });
                    connection.query(createTableCheckBuilder(table), (error, results, cb) => {
                        if (error) {
                            throw error;
                        }
                        if (results.length === 0) {
                            connection.query(createDatabaseTableBuilder(fields, table), (error, results, cb) => {
                                if (error) {
                                    throw error;
                                }
                            });
                        } else {
                            connection.query(createTableGetFieldInfoBuilder(table), (error, results, cb) => {
                                if (error) {
                                    throw error;
                                }
                                let alterFieldsBuilder = createAlterFieldsBuilder(fields, results, table);
                                if (alterFieldsBuilder) {
                                    // alter fields
                                    connection.query(alterFieldsBuilder, (error, results, cb) => {
                                        if (error) {
                                            throw error;
                                        }
                                    });
                                }
                            });
                        }
                    });
                },
                insert: (fields, data, callback) => {
                    let availableFields = [];
                    let fieldData = [];
                    for (let i = 0; i < fields.length; i++) {
                        let field = fields[i];
                        if (data[field.name]) {
                            availableFields.push(field.name);
                            fieldData.push(data[field.name]);
                        }
                    }
                    if (availableFields.length === 0) {
                        callback(new Error('No available fields'));
                        return;
                    }
                    // validate data
                    for (let i = 0; i < availableFields.length; i++) {
                        let field = availableFields[i];
                        let mappedType = FIELD_TYPE_MAPPING[fields[i].type];
                        if (!mappedType.validate(data[field])) {
                            callback(new Error('Invalid data type for field: ' + field));
                            return;
                        }
                    }
                    connection.query(createDatabasePreparedStatements(availableFields, table), fieldData, (error, results, cb) => {
                        if (error) {
                            callback(error);
                        }
                        callback();
                    });
                },
                end: () => {
                    connection.end();
                },
                get: (beforeDate, afterDate, maxQuery, callback) => {
                    let queryBuilder = 'SELECT * FROM data';
                    let fieldData = [];
                    if (beforeDate && afterDate) {
                        queryBuilder += ' WHERE date < ? AND date > ?';
                        fieldData.push(beforeDate);
                        fieldData.push(afterDate);
                    } else if (beforeDate) {
                        queryBuilder += ' WHERE date < ?';
                        fieldData.push(beforeDate);
                    } else if (afterDate) {
                        queryBuilder += ' WHERE date > ?';
                        fieldData.push(afterDate);
                    }
                    queryBuilder += ' ORDER BY date DESC LIMIT ?';
                    fieldData.push(maxQuery);
                    connection.query(queryBuilder, fieldData, (error, results, cb) => {
                        if (error) {
                            callback(error);
                        }
                        callback(null, results);
                    });
                }
            }
        default:
            throw new Error('Invalid database type: ' + databaseType);
    }
}

function validateFields(fields) {
    // must exclude id and date
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        if (PRESERVED_FIELD_NAMES.indexOf(field.name) !== -1) {
            throw new Error('Invalid field name: ' + field.name);
        }
        let mappedType = FIELD_TYPE_MAPPING[field.type];
        if (!mappedType) {
            throw new Error('Invalid field type: ' + field.type);
        }
    }
}

export default function startServer({
                                        serverPort = 3000,
                                        databaseType = 'mysql',
                                        database = {
                                            host: 'localhost',
                                            port: 3306,
                                            name: 'iot',
                                            user: 'root',
                                            password: '',
                                            table: 'data'
                                        },
                                        fields = [
                                            {
                                                name: '',
                                                type: 'string'
                                            }
                                        ],
                                        secret = '' || function (secretKey) {
                                            return true;
                                        },
                                        rateLimit = -1,
                                        payloadType = 'json',
                                        payloadLimit = 1000
                                    },) {
    validateFields(fields);
    serverPort |= process.env.PORT;
    const databaseConnection = createDatabaseConnection(databaseType, database);
    databaseConnection.initialize(fields);
    const rateLimitMap = {};
    function rateLimitCheck(ip) {
        // if (rateLimit === -1) return 0;
        // let rateLimitTime = rateLimitMap[ip];
        // if (!rateLimitTime) {
        //     rateLimitMap[ip] = Date.now();
        //     return 0;
        // }
        // let now = Date.now();
        // if (now - rateLimitTime < rateLimit) {
        //     return now - rateLimitTime;
        // }
        // rateLimitMap[ip] = now;
        // return 0;
        // MUST ALSO INVALIDATE RATE LIMIT
        if (rateLimit === -1) return 0;
        for (let key in rateLimitMap) {
            let rateLimitTime = rateLimitMap[key];
            if (Date.now() - rateLimitTime > rateLimit) {
                delete rateLimitMap[key];
            }
            if (key === ip) {
                let now = Date.now();
                if (now - rateLimitTime < rateLimit) {
                    return now - rateLimitTime;
                }
            }
        }
        rateLimitMap[ip] = Date.now();
        return 0;
    }
    function checkSecretKey(secretKey) {
        if (!secret) return true;
        // check if secret is function
        if (typeof secret === 'function') {
            return secret(secretKey);
        }
        return secretKey === secret;
    }
    const app = express();
    switch (payloadType) {
        case "json":
            app.use(express.json());
            break;
        case "raw":
            app.use(express.raw());
            break;
        case "text":
            app.use(express.text());
            break;
        default:
            throw new Error('Invalid payload type: ' + payloadType);
    }
    app.get('/data', (request, response) => {
        let secretKey = request.query['secret'];
        if (!checkSecretKey(secretKey)) {
            response.status(STATUS_CODE_ACCESS_DENIED).send({
                status: STATUS_ACCESS_DENIED,
                message: 'Access denied'
            });
            return;
        }
        // check rate limit
        let rateLimitTime = rateLimitCheck(request.ip);
        if (rateLimitTime > 0) {
            response.status(STATUS_CODE_RATE_LIMITED).send({
                status: STATUS_RATE_LIMITED,
                message: 'Rate limited',
                time: rateLimit - rateLimitTime
            });
            return;
        }
        databaseConnection.insert(fields, request.query, (error) => {
            if (error) {
                response.status(STATUS_CODE_FAILED).send({
                    status: STATUS_FAILED,
                    message: error.message
                });
                return;
            }
            response.status(STATUS_CODE_SUCCESS).send({
                status: STATUS_SUCCESS,
            });
        });
    });
    app.get('/', (request, response) => {
        response.status(STATUS_CODE_SUCCESS).send({
            status: STATUS_SUCCESS,
            message: 'Server is running'
        });
    });
    app.get('/status', (request, response) => {
        let secretKey = request.query['secret'];
        if (!checkSecretKey(secretKey)) {
            response.status(STATUS_CODE_ACCESS_DENIED).send({
                status: STATUS_ACCESS_DENIED,
                message: 'Access denied'
            });
            return;
        }
        let beforeDate = request.query['beforeDate'];
        let afterDate = request.query['afterDate'];
        let maxQuery = request.query['maxQuery'] || 100;
        databaseConnection.get(beforeDate, afterDate, maxQuery, (error, results) => {
            if (error) {
                response.status(STATUS_CODE_FAILED).send({
                    status: STATUS_FAILED,
                    message: error.message
                });
                return;
            }
            let data = [];
            for (let i = 0; i < results.length; i++) {
                let result = results[i];
                let dataObject = {};
                for (let j = 0; j < fields.length; j++) {
                    let field = fields[j];
                    if (result[field.name] === null || result[field.name] === undefined) continue;
                    dataObject[field.name] = result[field.name];
                }
                dataObject['date'] = result['date'];
                data.push(dataObject);
            }
            response.status(STATUS_CODE_SUCCESS).send({
                status: STATUS_SUCCESS,
                data: data
            });
        });
    })
    const a = 'VXNpbmcgaW90LXNlcnZlciB2';
    const b = 'IGJ5IFRoaXRvIFlhbGFzYXRyaWEgU3VuYXJ5YSAoaHR0cDovL2xvY2FsaG9zdDo=';
    const c = 'KQ==';
    const d = 'Y29uc29sZQ==';
    const e = 'bG9n';
    let server = app.listen(serverPort, () => {
        const string = Buffer.from(a, 'base64').toString('ascii') +
            VERSION +
            Buffer.from(b, 'base64').toString('ascii') +
            serverPort +
            Buffer.from(c, 'base64').toString('ascii');
        eval(Buffer.from(d, 'base64').toString('ascii'))[Buffer.from(e, 'base64').toString('ascii')](string);
    });
    return {
        close: () => {
            server.close();
            databaseConnection.end();
        },
        setSecret: (newSecret) => {
            secret = newSecret;
        }
    }
}
