// Library yang digunakan untuk membuat server IoT
import express from 'express';
// express adalah library yang digunakan untuk membuat server HTTP
import mysql from "mysql";
// mysql adalah library yang digunakan untuk menghubungkan server dengan database MySQL

// Konstanta-konstanta yang digunakan untuk mengirimkan respon dari server
const STATUS_SUCCESS = 'success';
// STATUS_SUCCESS digunakan untuk mengirimkan respon bahwa permintaan berhasil
const STATUS_FAILED = 'failed';
// STATUS_FAILED digunakan untuk mengirimkan respon bahwa permintaan gagal
const STATUS_ACCESS_DENIED = 'access-denied';
// STATUS_ACCESS_DENIED digunakan untuk mengirimkan respon bahwa permintaan ditolak karena secret key tidak valid
const STATUS_RATE_LIMITED = 'rate-limited';

// Konstanta-konstanta yang digunakan untuk mengirimkan kode status dari server
const STATUS_CODE_SUCCESS = 200;
const STATUS_CODE_FAILED = 400;
const STATUS_CODE_ACCESS_DENIED = 401;
const STATUS_CODE_RATE_LIMITED = 429;

// Field-field yang tidak boleh digunakan oleh pengguna
const PRESERVED_FIELD_NAMES = ['id'];

// Konstanta-konstanta yang digunakan untuk mengubah tipe data dari field
const FIELD_TYPE_MAPPING = {
    string: {
        // Tipe data dalam database
        type: 'VARCHAR',
        // Panjang data dalam database
        length: 255,
        // Fungsi untuk memvalidasi data
        validate: (value) => {
            return typeof value === 'string';
        },
        // Fungsi untuk mengubah data menjadi tipe data yang sesuai
        parse: (value) => {
            return value;
        }
    },
    number: {
        type: 'DOUBLE',
        validate: (value) => {
            value = parseFloat(value);
            return !isNaN(value);
        },
        parse: (value) => {
            return parseFloat(value);
        }
    },
    boolean: {
        type: 'BOOLEAN',
        validate: (value) => {
            return typeof value === 'boolean' || value === 'true' || value === 'false';
        },
        parse: (value) => {
            return value === 'true' ? 1 : 0;
        }
    },
    float: {
        type: 'FLOAT',
        validate: (value) => {
            value = parseFloat(value);
            return !isNaN(value);
        },
        parse: (value) => {
            return parseFloat(value);
        }
    },
    integer: {
        type: 'INT',
        validate: (value) => {
            value = parseInt(value);
            return !isNaN(value);
        },
        parse: (value) => {
            return parseInt(value);
        }
    },
    date: {
        type: 'DATETIME',
        validate: (value) => {
            return !isNaN(Date.parse(value));
        },
        parse: (value) => {
            return value;
        }
    },
    decimal: {
        type: 'DECIMAL',
        validate: (value) => {
            value = parseFloat(value);
            return !isNaN(value);
        },
        parse: (value) => {
            return parseFloat(value);
        }
    }
}
// Fungsi untuk membuat query untuk mendapatkan field-field dari sebuah tabel
function queryGetTableFields(table) {
    return `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`;
}

// Fungsi untuk mendapatkan mapping dari tipe data
function getFieldTypeMapping(type) {
    // check if "type" is an object that contains "type", "length", "validate", and "parse"
    if (typeof type === 'object') {
        if (type.type && type.validate && type.parse) {
            return type;
        }
    }
    if (typeof type === 'string') {
        // Periksa apakah tipe data memiliki panjang. Contoh: string(255)
        let matches = type.match(/(.*?)\((.*?)\)/);
        if (matches) {
            let element = FIELD_TYPE_MAPPING[matches[1]];
            if (!element) {
                throw new Error('Invalid field type: ' + type);
            }
            let mappedType = {
                ...element
            };
            mappedType.length = parseInt(matches[2]);
            return mappedType;
        }
        let mappedType = FIELD_TYPE_MAPPING[type];
        if (!mappedType) {
            throw new Error('Invalid field type: ' + type);
        }
        return mappedType;
    }
    throw new Error('Invalid field type: ' + type);
}

// Fungsi untuk membuat query untuk mengubah field-field dari sebuah tabel
function queryAlterTableFields(fields, databaseFields, table, date_field) {
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
            let mappedType = getFieldTypeMapping(type);
            // Contoh: ALTER TABLE iot_table ADD suhu DOUBLE;
            queryBuilder += `ALTER TABLE ${table} ADD ${name} ${mappedType.type};`;
        } else {
            let mappedType = getFieldTypeMapping(type);
            if (mappedType.type !== databaseFields[i].DATA_TYPE || mappedType.length !== databaseFields[i].CHARACTER_MAXIMUM_LENGTH) {
                if (mappedType.length) {
                    // Contoh: ALTER TABLE iot_table MODIFY suhu DOUBLE(10);
                    queryBuilder += `ALTER TABLE ${table} MODIFY ${name} ${mappedType.type}(${mappedType.length});`;
                } else {
                    // Contoh: ALTER TABLE iot_table MODIFY suhu DOUBLE;
                    queryBuilder += `ALTER TABLE ${table} MODIFY ${name} ${mappedType.type};`;
                }
            }
        }
    }
    // Jika ada field yang tidak terdaftar dalam fields, maka field tersebut akan dihapus
    for (let i = 0; i < databaseFields.length; i++) {
        let databaseField = databaseFields[i];
        if (PRESERVED_FIELD_NAMES.indexOf(databaseField.COLUMN_NAME) !== -1) {
            continue;
        }
        // check if column name is date field
        if (databaseField.COLUMN_NAME === date_field) {
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

// Fungsi untuk membuat query untuk membuat sebuah tabel
// Contoh: CREATE TABLE iot_table (id INT AUTO_INCREMENT PRIMARY KEY, suhu DOUBLE, kelembapan DOUBLE, lux DOUBLE, date DATETIME);
function queryCreateTable(fields, table, date_field) {
    let queryBuilder = `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY`;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let name = field.name;
        let type = field.type;
        queryBuilder += ', ';
        let mappedType = getFieldTypeMapping(type);
        // queryBuilder += `${name} ${mappedType}`;
        if (mappedType.length) {
            queryBuilder += `${name} ${mappedType.type}(${mappedType.length})`;
        } else {
            queryBuilder += `${name} ${mappedType.type}`;
        }
    }
    // add date field
    // queryBuilder += ', date TIMESTAMP)';
    // store default value for TIMESTAMP as current time
    queryBuilder += `, ${date_field} TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    return queryBuilder;
}

// Fungsi untuk membuat query untuk mendapatkan tabel
function queryGetTableSchema(table) {
    return `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${table}'`;
}

// Fungsi untuk membuat koneksi ke database
function createDatabaseConnection({
                                      type = 'mysql',
                                      host = 'localhost',
                                      port = 3306,
                                      name = 'iot',
                                      user = 'root',
                                      password = '',
                                      table = 'data',
                                      date_field = 'date',
                                  }, allowAlterTable = true) {
    switch (type) {
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
                // Fungsi untuk menginisialisasi database
                initialize: (fields) => {
                    // Mengambil field-field dari tabel
                    connection.query(queryGetTableSchema(table), (error, results, cb) => {
                        if (error) {
                            throw error;
                        }
                        if (results.length === 0) {
                            // Jika tabel tidak ada, maka buat tabel
                            connection.query(queryCreateTable(fields, table, date_field), (error, results, cb) => {
                                if (error) {
                                    throw error;
                                }
                            });
                        } else if (allowAlterTable) {
                            // Jika tabel ada, maka periksa field-field dari tabel
                            connection.query(queryGetTableFields(table), (error, results, cb) => {
                                if (error) {
                                    throw error;
                                }
                                // Periksa apakah ada field yang tidak terdaftar dalam field-field yang diberikan
                                let alterFieldsBuilder = queryAlterTableFields(fields, results, table, date_field);
                                if (alterFieldsBuilder) {
                                    // Jika ada field yang tidak terdaftar dalam field-field yang diberikan, maka ubah field-field dari tabel
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
                // Fungsi untuk mengakhiri koneksi ke database
                end: () => {
                    connection.end();
                },
                // Fungsi untuk menjalankan query
                query: (query, fieldData, callback) => {
                    connection.query(query, fieldData, (error, results, cb) => {
                        if (error) {
                            callback(error);
                        }
                        callback(null, results);
                    });
                },
            }
        default:
            throw new Error('Invalid database type: ' + type);
    }
}

// Fungsi untuk memvalidasi field-field
// Jika field-field tidak valid, maka akan mengembalikan error
// Field-field yang tidak valid adalah field-field yang memiliki nama yang sama dengan field-field yang sudah ditentukan
// dan field-field yang memiliki tipe data yang tidak valid
function validateFields(fields) {
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        if (PRESERVED_FIELD_NAMES.indexOf(field.name) !== -1) {
            throw new Error('Invalid field name: ' + field.name);
        }
        getFieldTypeMapping(field.type);
    }
}

/**
 * Fungsi untuk memulai server IoT
 * @param serverPort - Port dari server
 * @param database - Konfigurasi database
 * @param allowAlterTable - Jika true, maka server dapat mengubah field-field dari tabel
 * @param fields - Field-field yang digunakan
 * @param queries - Query-query yang digunakan
 * @param secret - Secret key yang digunakan untuk mengakses server
 * @param rateLimit - Batas waktu untuk mengakses server
 * @param payloadType - Tipe data payload
 * @param payloadPrettify - Jika true, maka payload akan dikirimkan dalam bentuk yang mudah dibaca
 * @param callback - Fungsi yang akan dipanggil ketika server sudah berjalan
 * @returns {{setSecret: setSecret, getRateLimits: (function(): number), close: close}} - Objek yang berisi fungsi-fungsi yang dapat digunakan untuk mengubah konfigurasi server
 */
export default function startServer({
                                        serverPort = 3000,
                                        database = {
                                            type: 'mysql',
                                            host: 'localhost',
                                            port: 3306,
                                            name: 'iot',
                                            user: 'root',
                                            password: '',
                                            table: 'data',
                                            date_field: 'date',
                                        },
                                        allowAlterTable = true,
                                        fields = [
                                            {
                                                name: '',
                                                type: 'string'
                                            }
                                        ],
                                        queries = {},
                                        secret = '' || function (secretKey) {
                                            return true;
                                        },
                                        rateLimit = -1,
                                        payloadType = 'json',
                                        payloadPrettify = false,
                                    }, callback = function() {}) {
    // Validasi field-field
    validateFields(fields);
    // Jika port dari server tidak ditentukan, maka gunakan port dari environment variable
    serverPort |= process.env.PORT;
    // Buat koneksi ke database
    const databaseConnection = createDatabaseConnection(database, allowAlterTable);
    // Inisialisasi database
    databaseConnection.initialize(fields);
    // Buat map untuk menyimpan waktu terakhir kali sebuah IP mengakses server
    const rateLimitMap = {};
    // Fungsi untuk memeriksa apakah sebuah IP sudah melebihi batas waktu untuk mengakses server
    function rateLimitCheck(ip) {
        if (rateLimit === -1) return 0;
        for (let key in rateLimitMap) {
            let rateLimitTime = rateLimitMap[key];
            if (Date.now() - rateLimitTime > rateLimit) {
                delete rateLimitMap[key];
            }
            if (key === ip) {
                let now = Date.now();
                if (now - rateLimitTime < rateLimit) {
                    return rateLimit - (now - rateLimitTime);
                }
            }
        }
        rateLimitMap[ip] = Date.now();
        return 0;
    }
    // Fungsi untuk memeriksa apakah sebuah secret key valid
    function checkSecretKey(secretKey, ip) {
        if (!secret) return true;
        // check if secret is function
        if (typeof secret === 'function') {
            return secret(secretKey, ip);
        }
        if (typeof secret === 'string') {
            return secretKey === secret;
        }
        if (typeof secret === 'object') {
            let key = secret[ip];
            if (!key) return false;
            return key === secretKey;
        }
        return false;
    }
    // Buat server
    const app = express();
    switch (payloadType) {
        case "json":
            // Mengubah payload menjadi JSON
            app.use(express.json());
            if (payloadPrettify) {
                // Mengubah payload menjadi JSON yang mudah dibaca
                app.set('json spaces', 2);
            }
            break;
        default:
            // Jika payload tidak valid, maka kirimkan error
            throw new Error('Invalid payload type: ' + payloadType);
    }
    // Fungsi untuk memeriksa apakah payload valid
    app.get('/', (request, response) => {
        response.status(STATUS_CODE_SUCCESS).send({
            status: STATUS_SUCCESS,
            message: 'Server is running'
        });
    });
    // Fungsi untuk mengirimkan waktu server
    app.get('/getservertime', (request, response) => {
        response.status(STATUS_CODE_SUCCESS).send({
            status: STATUS_SUCCESS,
            date: Date.now()
        });
    });
    // customQueryMap berisi query-query yang digunakan
    let customQueryMap = {};
    for (let key in queries) {
        let variableOrder = [];
        let query = queries[key];
        let queryBuilder;
        let variableValidators;
        let valueSerializer;
        let valuePreprocessor;
        if (typeof query === 'string') {
            queryBuilder = query;
            variableValidators = {};
        } else {
            queryBuilder = query.query;
            variableValidators = query['validators'] || {};
            valueSerializer = query['serializer'];
            valuePreprocessor = query['preprocessor'];
        }
        // Carilah field-field yang ada dalam query
        // Bentuk field-field adalah {field}
        let matches = queryBuilder.match(/{(.*?)}/g);
        if (matches) {
            for (let i = 0; i < matches.length; i++) {
                let match = matches[i];
                let field = match.substring(1, match.length - 1);
                // prevent pushing special variables
                if (field === 'table') continue;
                if (field.startsWith('fields[') && field.endsWith(']')) continue;
                if (field === 'date') continue;
                variableOrder.push({
                    name: field,
                });
                queryBuilder = queryBuilder.replace(match, '?');
            }
        }
        // SPECIAL VARIABLES
        // {table}
        queryBuilder = queryBuilder.replaceAll('{table}', database.table);
        // {date}
        queryBuilder = queryBuilder.replaceAll('{date}', database.date_field);
        // {fields[X]}
        for (let i = 0; i < fields.length; i++) {
            let field = fields[i];
            queryBuilder = queryBuilder.replaceAll(`{fields[${i}]}`, field.name);
        }
        customQueryMap[key] = {
            query: queryBuilder,
            variableOrder: variableOrder,
            variableValidators: variableValidators,
            valueSerializer: valueSerializer,
            valuePreprocessor: valuePreprocessor,
        };
    }
    for (let key in customQueryMap) {
        app.get(`/${key}`, (request, response) => {
            let secretKey = request.query['secret'];
            if (!checkSecretKey(secretKey)) {
                response.status(STATUS_CODE_ACCESS_DENIED).send({
                    status: STATUS_ACCESS_DENIED,
                    message: 'Access denied'
                });
                return;
            }
            let rateLimitTime = rateLimitCheck(request.ip);
            if (rateLimitTime) {
                response.status(STATUS_CODE_RATE_LIMITED).send({
                    status: STATUS_RATE_LIMITED,
                    message: 'Rate limited',
                    time: rateLimitTime
                });
                return;
            }
            let fieldData = [];
            let queryMapElement = customQueryMap[key];
            let queryBuilder = queryMapElement.query;
            let variableOrder = queryMapElement.variableOrder;
            for (let i = 0; i < variableOrder.length; i++) {
                let field = variableOrder[i];
                // skip predefined variables
                let value = request.query[field.name];
                if (!value) {
                    response.status(STATUS_CODE_FAILED).send({
                        status: STATUS_FAILED,
                        message: 'Missing field: ' + field.name
                    });
                    return;
                }
                let validator = queryMapElement.variableValidators[field.name];
                if (validator) {
                    if (!validator(value)) {
                        response.status(STATUS_CODE_FAILED).send({
                            status: STATUS_FAILED,
                            message: 'Invalid field value: ' + field.name
                        });
                        return;
                    }
                }
                if (queryMapElement.valuePreprocessor) {
                    let preprocessor = queryMapElement.valuePreprocessor[field.name];
                    if (preprocessor) {
                        value = preprocessor(value);
                    }
                }
                fieldData.push(value);
            }
            databaseConnection.query(queryBuilder, fieldData, (error, results) => {
                if (error) {
                    response.status(STATUS_CODE_FAILED).send({
                        status: STATUS_FAILED,
                        message: error.message
                    });
                    return;
                }
                if (queryMapElement.valueSerializer) {
                    results = queryMapElement.valueSerializer(results);
                }
                response.status(STATUS_CODE_SUCCESS).send({
                    status: STATUS_SUCCESS,
                    data: results
                });
            });
        });
    }
    let server = app.listen(serverPort, () => {
        if (callback) {
            callback();
        }
    });
    return {
        close: () => {
            server.close();
            databaseConnection.end();
        },
        setSecret: (newSecret) => {
            secret = newSecret;
        },
        getRateLimits: () => {
            return rateLimit;
        }
    }
}
