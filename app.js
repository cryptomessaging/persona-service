'use strict'

const express = require('express')
const app = express()

const bodyParser = require('body-parser');
app.use( bodyParser.raw({ limit:'2mb', type:'*/*' }) );

const s3 = require('./my_modules/namedS3').usingBucket('personas.cryptomessaging.org');
app.use('/', require('./my_modules/open-routes')(express,s3));
app.use('/', require('./my_modules/secure-routes')(express,s3));

module.exports = app