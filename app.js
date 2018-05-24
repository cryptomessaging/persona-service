'use strict'

const fs = require('fs')
const path = require('path')
const express = require('express')
const app = express()

const bodyParser = require('body-parser');
app.use( bodyParser.raw({ limit:'2mb', type:'*/*' }) );

const s3 = require('./my_modules/namedS3').usingBucket('personas.cryptomessaging.org');
app.use('/', require('./my_modules/view-routes')(express,s3));
app.use('/v1', require('./my_modules/controller-routes')(express,s3));

module.exports = app;

// make sure the service.json etc. are available from edge caching network
[
    {name:'service.json',type:'application/json'},
    {name:'index.html',type:'text/html'},
    {name:'favicon.ico',type:'image/x-icon'}
].forEach( file => {
    uploadFile( file.name, file.type, err => {
        if( err )
            console.log( 'ERROR: Failed to upload', file.name, err );
        else
            console.log( 'Uploaded', file.name, 'to edge caching network' );
    });
});

function uploadFile(filename,type,callback) {
    const options = { contentType:type };
    const file = fs.readFileSync( path.join('static',filename) );
    s3.saveMedia(filename,file,options,callback);
}