const fs = require('fs')
const path = require('path')
const edsig = require('edsig')
const net = require('./net')

const DEBUG = true;

module.exports = function( express, s3 ) {
    var router = express.Router();

    // simple status page, also used for server health
    const runningSince = new Date();
    router.get( '/status', function(req,res) {
         res.json({ version:[1,0,0], started:runningSince, url:controllerBaseUrl(req) }); 
    });

    // request to update configuration files etc.
    router.post( '/setup', function(req,res) {
        let url = controllerBaseUrl(req);
        const vars = {
            "\\\${CONTROLLER_URL}": url
        };
        console.log( 'Service controller URL', url );

        // make sure the service.json etc. are available from edge caching network
        let uploads = [];
        [
            {name:'service.json',type:'application/json',vars:vars},
            {name:'index.html',type:'text/html'},
            {name:'favicon.ico',type:'image/x-icon'}
        ].forEach( file => {
            uploads.push( uploadFile( file.name, file.type, file.vars ) );
        });

        Promise.all( uploads ).then(()=>{
            res.json({});
        }).catch( err => {
            console.error(err);
            res.status(500).send('ERROR: ' + err.name + ' ' + err.message );
        });
    });

    // if vars is defined (a map of substitutions) then open the file as
    // a utf8 string and do (multiple) replacements of vars
    function uploadFile(filename,type,vars,callback) {
        return new Promise((resolve,reject)=>{
            const options = { contentType:type };
            let file = fs.readFileSync( path.join('static',filename), vars ? 'utf8' : null );
            if( vars ) {
                Object.keys(vars).forEach( key => {
                    let value = vars[key];
                    file = file.replace(new RegExp(key,'g'), value);
                });
            }

            console.log( 'Uploading', '/' + filename, 'to S3' );
            s3.saveMedia(filename,file,options,err => {
                if(err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    // If there's an authorization header, then process header
    router.use(function(req, res, next) {
        try {
            let auth = edsig.verifyRequestSignature( req );
            if( !auth ) {
                // they didn't pass an authorization header, but we need one to continue
                return net.signalNotOk(req,res,[4],'Request requires EdSig authentication');
            }
            
            req.auth = auth;
            next();
        } catch(err) {
            // When processing an authorization header fails, we land here
            console.error(err);
            net.signalError(req,res,err);   
        }
    });

    router.post( '/personas/:pid/:path(*)',function(req,res){
        // make sure :pid matches auth
        if( req.params.pid != req.auth.pid )
            return net.signalNotOk(req,res,[4],'EdSig authentication doesnt match pid');

        try {
            // make sure the content is certified
            let pathname = '/personas/' + req.params.pid + '/' + req.params.path;
            let cert = edsig.verifyContentSignature( pathname, req );

            if( req.params.pid != cert.pid )
                return net.signalNotOk(req,res,[4],'EdSig certification doesnt match pid');

            let media = req.body;
            let options = {
                metadata: {
                    "certification": req.headers['x-certification'],
                    "content-hash": req.headers['x-content-hash'],
                    "created": req.headers['x-created']
                },
                contentType: req.headers['content-type']
            };
            s3.saveMedia(pathname,media,options,(err,result) => {
                if(err)
                    net.signalError(req,res,err);
                else
                    res.json({});
            });
        } catch(err) {
            console.error(err);
            net.signalError(req,res,err);
        }
    });

    console.log( 'Controller API routes are ready' );
    return router;
}

// Determine the this services controller base url.  Some platforms, like Lambda, don't pass
// through the complete the complete URL pathname, in which case the
// PERSONAS_CONTROLLER_PATHNAME_PREFIX can be used to adjust it.
function controllerBaseUrl(req) {
    const PERSONAS_CONTROLLER_PATHNAME_PREFIX = process.env.PERSONAS_CONTROLLER_PATHNAME_PREFIX || '';
    const protocol = process.env.PERSONAS_CONTROLLER_PROTOCOL || req.protocol;

    let url = protocol + "://" + req.get('host') + req.originalUrl;
    url = url.split('?')[0];    // just in case there's a query string
    let lastSlash = url.lastIndexOf('/');
    let fixedurl = url.substring(0,lastSlash) + PERSONAS_CONTROLLER_PATHNAME_PREFIX;
    if( DEBUG ) console.log('controllerBaseUrl()', url, fixedurl );
    return fixedurl;
}