var apigee = require('apigee-access');
var async = require("async");
var bodyParser = require('body-parser');
var request = require('request');
var httpProxy = require('http-proxy');

var all_orgs = [];

if(apigee.getMode() === apigee.APIGEE_MODE) {
    var orgVault = apigee.getVault('aggregator_org_info', 'organization');
    orgVault.getKeys(function(err, $orgs){
        var tasks = [];
        Object.keys($orgs).forEach(function($i){
            this.push(function(callback){
                orgVault.get($orgs[$i], function(er, val){
                    callback(null, val);
                });
            });
        }, tasks);
        async.parallel(tasks, function(err, rs){
            Object.keys(rs).forEach(function(j){
                $r = rs[j].split(",");
                all_orgs[$r[1]] = {
                    endpoint : $r[0],
                    org: $r[1],
                    authorization: "Basic " + new Buffer($r[2] + ":" + $r[3]).toString("base64"),
                };
            });

        });
    });
} else {
    all_orgs = {
        'gkli' :
        {
            org: 'gkli',
            endpoint : 'https://api.enterprise.apigee.com/v1',
            authorization : ''
        },
        'gkoli_orgadmin3':
        {
            org: 'gkoli_orgadmin3',
            endpoint : 'https://api.enterprise.apigee.com/v1',
            authorization: '',
        }
    };
}

var self = module.exports = {
    apiProxy : null,

    initialize : function(app){
        app.use(bodyParser.json()); // for parsing application/json
        app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

        app.use(function(req,res,next){
            $default_org = req.originalUrl.split("/").splice(0,3)[2];
            request(
                {
                    'uri' : all_orgs[$default_org]['endpoint'] + "/o/" + $default_org,
                    'headers': {
                        'Authorization' : req.headers.authorization,
                    }
            }, function(_err, _response, _body){
                    if(_response.statusCode !== 200){
                        try{
                            _body = JSON.parse(_body);
                            res.json(_body);
                        } catch($e){
                            //Ignore parsing errors
                        }
                        res.status(_response.statusCode).end();
                    } else {
                        //Pick up the configuration information for the orgname in the url and assign to apiProxy
                        var $paths = req.url.split("/");
                        self.apiProxy = httpProxy.createProxyServer({
                            changeOrigin: true,
                            target: all_orgs[$paths[2]]['endpoint'],
                        });
                        if(apigee.getMode() === apigee.APIGEE_MODE) {
                            if(all_orgs.length === 0) {
                                res.json({error: "Org Configuration not set correctly in vault"})
                                res.status(500).end();
                            } else {
                                next();
                            }
                        }else {
                            Object.keys(all_orgs).forEach(function(i){
                                all_orgs[i].authorization = req.headers.authorization;
                            });
                            next();
                        }
                    }
                });
        });

    },
    catch_all_route : function(app) {
        if(apigee.getMode() !== apigee.APIGEE_MODE) {
            /*
             * Catch all function for when doing local development
             *
             * This will run the calls against the first org in the settings
             */

            app.all('*', function(req,res){
                console.log("catch All : " + req.url);
                self.apiProxy.web(req, res);
            });
        }
    },
    get_aggregator_task : function(req, resource, org_name){
        var $org = all_orgs[org_name];
        var $task = function (callback){
            request({
                'method': req.method,
                'uri': $org['endpoint'] + '/o/' + $org['org'] + resource,
                'headers': {
                    'Accept': req.header('accept'),
                    'Authorization' : $org['authorization'],
                    'Content-Type' : req.header('content-type'),
                },
                'qs': req.query,
                'body' : JSON.stringify(req.body),
            }, function (err, response, body) {
                if(err) {
                    return callback(null, {error: err});
                } else {
                    try{
                        body = JSON.parse(body);
                    } catch($e){
                        //Ignore parsing errors
                    }
                    return callback(null, {org: $org['org'], body: body, status_code:  response.statusCode , response_headers : response.headers});
                }
            });

        }
        return $task;
    },
    get_aggregator_tasks : function(req, resource) {
        var tasks = [];
        Object.keys(all_orgs).forEach(function ($index) {
            this.push(self.get_aggregator_task(req, resource, $index));
        }, tasks);
        return tasks;
    },
    format_product_name : function(org, product_name) {
        return "{{" + org + "}}"+product_name;
    },
    parse_product_from_str: function($str){
        return $str.indexOf("}}") !== -1 ? $str.substring($str.indexOf("}}") + 2) : $str;
    },
    parse_org_from_product_name : function($product){
        return $product.indexOf("}}") === -1 ? null : $product.substr(2, $product.indexOf("}}") - 2);
    },
    sync_developer : function(developerId, requestType, fromOrg, toOrg, callback) {
        var $fromOrg = all_orgs[fromOrg];
        request({
            'method' : "GET",
            'uri' : $fromOrg['endpoint'] + "/o/" + fromOrg + "/developers/" + developerId,
            'headers' : {
                "Authorization" : $org['authorization'],
                'Content-Type' : 'application/json'
            }
        }, function(err, response, body) {
            console.log(err);
            //console.log(response);
            console.log(body);
            callback();
        });
    }
}