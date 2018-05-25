'use strict'

const express = require('express')
const app = express()

const bodyParser = require('body-parser');
app.use( bodyParser.raw({ limit:'2mb', type:'*/*' }) );

// Connect to S3 and wire in some view routes for debugging
const bucket = envOption( 'PERSONAS_S3_BUCKET', 'personas.bucket' );
const s3 = require('./my_modules/namedS3').usingBucket(bucket);
app.use('/', require('./my_modules/view-routes')(express,s3));

// Add in the controller routes, with the option of a path prefix
const prefix = envOption( 'PERSONAS_CONTROLLER_PATH_PREFIX', '/' );
app.use( prefix, require('./my_modules/controller-routes')(express,s3));

module.exports = app;

function envOption( name, defaultValue ) {
    const value = process.env[name];
    if( value ) {
        console.log( 'Using environment variable', name, 'value of', value );
        return value;
    } else {
        console.log( 'Environment variable', name, 'not defined, defaulting to', defaultValue );    
        return defaultValue;
    }
}
