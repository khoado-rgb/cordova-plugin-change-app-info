#import <Cordova/CDVPlugin.h>

extern NSString * const CAIUniversalLinkNotification;

@interface CAIUniversalLinks : CDVPlugin

- (void)subscribe:(CDVInvokedUrlCommand *)command;
- (void)unsubscribe:(CDVInvokedUrlCommand *)command;

@end
