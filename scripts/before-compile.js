var fs    = require('fs');     // nodejs.org/api/fs.html
var plist = require('plist');  // www.npmjs.com/package/plist
var path = require("path");
var semver = require('semver');

module.exports = function (context) {

    if(context.opts.platforms.indexOf('ios') === -1) return;

    console.log('Attempting to set app name for iOS');

    var PROJECTROOT = context.opts.projectRoot;
    
    var PLATFORMPATH = path.resolve(path.join(PROJECTROOT, 'platforms', 'ios'));
    
    var EXTENSION = '.xcodeproj';
    var targetFiles;    
    fs.readdir(PLATFORMPATH, function(err, files){
        targetFiles = files.filter(function(file) {
            return path.extname(file).toLowerCase() === EXTENSION;
        });
        
        if (!targetFiles){
            console.log("No " + EXTENSION + " file found. Exiting"); 
            return;
        }
        if (targetFiles.length != 1){
            console.log("More than one " + EXTENSION + " found. Exiting"); 
            return;
        }
    
        var PROJECTNAME = path.basename(targetFiles[0], EXTENSION);
        
        var INFOPLISTPATH = path.join(PLATFORMPATH, PROJECTNAME, PROJECTNAME + '-Info.plist');

        var xml = fs.readFileSync(INFOPLISTPATH, 'utf8');
        var obj = plist.parse(xml);


        var BUILDJSONPATH = path.join(PROJECTROOT, "build.json");
        var buildJsonText = fs.readFileSync(BUILDJSONPATH, 'utf8');
        var buildJsonObj = JSON.parse(buildJsonText);        
        buildJsonObj.ios.debug.buildFlag = [
            "PRODUCT_NAME = " + obj.CFBundleDisplayName.replace(/[/\\?%*:|"<>\+]/g, '')
        ]

        buildJsonObj.ios.release.buildFlag = [
            "PRODUCT_NAME = " + obj.CFBundleDisplayName.replace(/[/\\?%*:|"<>\+]/g, '')
        ]

        console.log(JSON.stringify(buildJsonObj));

        fs.writeFileSync(BUILDJSONPATH, JSON.stringify(buildJsonObj), { encoding: 'utf8' });

        //delete obj.CFBundleExecutable;

        /**
         * FIRST APPROACH
         * Set the CFBundleDisplayName only, using the variable set via the plugin instalation
         */
        //var name = getConfigParser(context, path.join(PLATFORMPATH, PROJECTNAME, 'config.xml')).getPreference('AppName');
        //obj.CFBundleDisplayName = name;
        
         /**
         * SECOND APPROACH
         * Clean the CFBundleExecutable so it does not have any invalid chars
         */
        /*obj.CFBundleExecutable = obj.CFBundleDisplayName.replace(/[/\\?%*:|"<>\+]/g, '');*/
    
        xml = plist.build(obj);
        fs.writeFileSync(INFOPLISTPATH, xml, { encoding: 'utf8' });
    });
};

function getConfigParser(context, config) {

    if (semver.lt(context.opts.cordova.version, '5.4.0')) {
        ConfigParser = context.requireCordovaModule('cordova-lib/src/ConfigParser/ConfigParser');
    } else {
        ConfigParser = context.requireCordovaModule('cordova-common/src/ConfigParser/ConfigParser');
    }

    return new ConfigParser(config);
}
