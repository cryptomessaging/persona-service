const edsig = require('./edsig')
const net = require('./net')

module.exports = function( express, s3 ) {
    var router = express.Router();

    // simple status page, also used for server health
    const runningSince = new Date();
    router.get( '/status', function(req,res) {
        res.json({ version:[1,0,0], started:runningSince }); 
    });

    // If there's an authorization header, then process header
    router.use(function(req, res, next) {
        try {
            let auth = edsig.verifyRequestSignature( req );
            if( !auth )
                return net.signalNotOk(req,res,[4],'Request requires EdSig authentication');
            
            req.auth = auth;
            next();
        } catch(err) {
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