
var child_process = require('child_process');

function isCordovaAbove(context, version) {
    try {
        var cordovaVersion = context.opts.cordova.version;
        if (!cordovaVersion) return false;

        var current = String(cordovaVersion).split('.').map(Number);
        var target = String(version).split('.').map(Number);

        for (var i = 0; i < Math.max(current.length, target.length); i++) {
            var currentPart = current[i] || 0;
            var targetPart = target[i] || 0;

            if (currentPart > targetPart) return true;
            if (currentPart < targetPart) return false;
        }

        return true;
    } catch (err) {
        console.warn('⚠️ Could not determine Cordova version:', err.message);
        return true;
    }
}

module.exports = function (context) {
    var cordovaAbove8 = isCordovaAbove(context, 8);
    if (!cordovaAbove8) {
      var deferral = context.requireCordovaModule("q").defer();
      child_process.exec('npm install', {cwd:__dirname},
        function (error) {
          if (error !== null) {
            console.log('exec error: ' + error);
            deferral.reject('npm installation failed');
          }
          deferral.resolve();
      });

      return deferral.promise;
    }
    return;
}
