'use strict'

global.DEBUG = true;
global.VERBOSE = true;

const express = require('express')
const app = express()

const bodyParser = require('body-parser');
app.use( bodyParser.raw({ limit:'2mb', type:'*/*' }) );

// Connect to S3 and wire in some view routes for debugging
const bucket = process.env.PERSONAS_S3_BUCKET || 'personas.bucket';
const s3 = require('./my_modules/namedS3').usingBucket(bucket);
app.use('/', require('./my_modules/view-routes')(express,s3));
app.use( '/', require('./my_modules/controller-routes')(express,s3));

module.exports = app;
