#import "CAIUniversalLinks.h"
#import <objc/runtime.h>

NSString * const CAIUniversalLinkNotification = @"CAIUniversalLinkNotification";

// A universal link can arrive before the webview (and therefore this plugin) is
// ready, so the URL is parked here until JS subscribes.
static NSURL *CAIPendingURL = nil;

@interface CAIUniversalLinks ()
@property (nonatomic, copy) NSString *subscriberCallbackId;
@end

@implementation CAIUniversalLinks

#pragma mark - App delegate installation

// cordova-ios never implements application:continueUserActivity:restorationHandler:
// (checked against CordovaLib 6.2.0 and 7.1.1), and MABS regenerates AppDelegate.m
// on every build, so the handler installs itself onto the app delegate class at
// image load time instead of being edited into the generated source.
+ (void)load
{
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class delegateClass = NSClassFromString(@"AppDelegate");

        if (delegateClass == nil) {
            NSLog(@"[UniversalLinks] AppDelegate class not found; universal links will not be delivered");
            return;
        }

        SEL originalSelector = @selector(application:continueUserActivity:restorationHandler:);
        SEL replacementSelector = @selector(cai_application:continueUserActivity:restorationHandler:);
        Method replacement = class_getInstanceMethod(self, replacementSelector);

        BOOL added = class_addMethod(delegateClass,
                                     originalSelector,
                                     method_getImplementation(replacement),
                                     method_getTypeEncoding(replacement));

        if (added) {
            // The delegate had no implementation of its own — nothing to chain to.
            return;
        }

        // Something already handles the activity: keep it reachable under the
        // replacement selector so cai_application:... calls through to it.
        class_addMethod(delegateClass,
                        replacementSelector,
                        method_getImplementation(replacement),
                        method_getTypeEncoding(replacement));

        method_exchangeImplementations(class_getInstanceMethod(delegateClass, originalSelector),
                                       class_getInstanceMethod(delegateClass, replacementSelector));
    });
}

// Installed on the app delegate, so `self` here is the AppDelegate instance and
// never this plugin. Only NSNotificationCenter and the chained original are used.
- (BOOL)cai_application:(UIApplication *)application
   continueUserActivity:(NSUserActivity *)userActivity
     restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
    if ([userActivity.activityType isEqualToString:NSUserActivityTypeBrowsingWeb] &&
        userActivity.webpageURL != nil) {
        NSURL *url = userActivity.webpageURL;

        NSLog(@"[UniversalLinks] Received %@", url.absoluteString);
        CAIPendingURL = url;

        [[NSNotificationCenter defaultCenter] postNotificationName:CAIUniversalLinkNotification
                                                            object:url];
    }

    // Present only when an original implementation was swizzled aside.
    if ([self respondsToSelector:@selector(cai_application:continueUserActivity:restorationHandler:)]) {
        return [self cai_application:application
                continueUserActivity:userActivity
                  restorationHandler:restorationHandler];
    }

    return YES;
}

#pragma mark - Plugin lifecycle

- (void)pluginInitialize
{
    [super pluginInitialize];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleUniversalLink:)
                                                 name:CAIUniversalLinkNotification
                                               object:nil];
}

- (void)dispose
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [super dispose];
}

- (void)handleUniversalLink:(NSNotification *)notification
{
    NSURL *url = notification.object;

    if ([url isKindOfClass:[NSURL class]]) {
        [self deliverURL:url];
    }
}

#pragma mark - JS interface

- (void)subscribe:(CDVInvokedUrlCommand *)command
{
    self.subscriberCallbackId = command.callbackId;

    // A cold launch delivers the activity long before JS is ready to listen.
    if (CAIPendingURL != nil) {
        [self deliverURL:CAIPendingURL];
    }
}

- (void)unsubscribe:(CDVInvokedUrlCommand *)command
{
    self.subscriberCallbackId = nil;

    [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK]
                                callbackId:command.callbackId];
}

- (void)deliverURL:(NSURL *)url
{
    if (self.subscriberCallbackId == nil) {
        // Keep it parked until a subscriber shows up.
        CAIPendingURL = url;
        return;
    }

    NSURLComponents *components = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
    NSMutableDictionary *params = [NSMutableDictionary dictionary];

    for (NSURLQueryItem *item in components.queryItems) {
        if (item.value != nil) {
            params[item.name] = item.value;
        }
    }

    NSDictionary *payload = @{
        @"url": url.absoluteString ?: @"",
        @"scheme": url.scheme ?: @"",
        @"host": url.host ?: @"",
        @"path": url.path ?: @"",
        @"query": url.query ?: @"",
        @"fragment": url.fragment ?: @"",
        @"params": params
    };

    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                                           messageAsDictionary:payload];
    [result setKeepCallbackAsBool:YES];

    [self.commandDelegate sendPluginResult:result callbackId:self.subscriberCallbackId];

    CAIPendingURL = nil;
}

@end
