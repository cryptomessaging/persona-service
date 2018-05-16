const edsig = require('./edsig')
const net = require('./net')

module.exports = function( express, s3 ) {
    var router = express.Router();

    // validate request with EdSig
    router.use(function(req, res, next) {
        edsig.verifyRequestSignature( req, (err,auth) => {
            if(err)
                return net.signalError(req,res,err);
            if( !auth )
                return net.signalNotOk(req,res,[4],'Request requires EdSig authentication');
            
            req.auth = auth;
            next();
        });
    });

    router.post( '/personas/:pid/:path(*)',function(req,res){
        // make sure :pid matches auth
        if( req.params.pid != req.auth.pid )
            return net.signalNotOk(req,res,[4],'EdSig authentication doesnt match pid');

        // make sure the content is certified
        edsig.verifyContentSignature( req, (err,auth) => {
            if(err)
                return net.signalError(req,res,err);
            if( req.params.pid != req.auth.pid )
                return net.signalNotOk(req,res,[4],'EdSig certification doesnt match pid');

            let path = 'personas/' + req.params.pid + '/' + req.params.path;
            let media = req.body;
            let options = {
                metadata: {
                    "certification": req.headers['x-certification'],
                    "content-hash": req.headers['x-content-hash'],
                    "created": req.headers['x-created']
                },
                contentType: req.headers['content-type']
            };
            s3.saveMedia(path,media,options,(err,result) => {
                if(err)
                    net.signalError(req,res,err);
                else
                    res.json({});
            });
        });
    });

    console.log( 'Secure API routes are ready' );
    return router;
}