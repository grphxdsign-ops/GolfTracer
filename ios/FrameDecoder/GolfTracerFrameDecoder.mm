#import "GolfTracerFrameDecoder.h"

#import <AVFoundation/AVFoundation.h>
#import <CoreGraphics/CoreGraphics.h>

// Error codes shared with the Android implementation (bridge contract).
static NSString *const GTErrOpenFailed = @"E_OPEN_FAILED";
static NSString *const GTErrBadSession = @"E_BAD_SESSION";
static NSString *const GTErrDecodeFailed = @"E_DECODE_FAILED";

static const double kGridToleranceMs = 1e-6;

#pragma mark - Session

@interface GTFrameDecoderSession : NSObject
@property (nonatomic, strong) AVURLAsset *asset;
@property (nonatomic, strong) AVAssetImageGenerator *generator;
@property (nonatomic, assign) double fps;
@property (nonatomic, assign) NSInteger stride;
@property (nonatomic, assign) NSInteger nextIndex;
@property (nonatomic, assign) NSInteger frameCount;
@property (nonatomic, assign) double endMs;
@property (nonatomic, assign) NSInteger outW;
@property (nonatomic, assign) NSInteger outH;
@end

@implementation GTFrameDecoderSession
@end

#pragma mark - Helpers

static NSURL *GTURLForUri(NSString *uri)
{
  if ([uri hasPrefix:@"file://"]) {
    NSURL *url = [NSURL URLWithString:uri];
    if (url != nil) {
      return url;
    }
    // The path may contain characters that need escaping; fall back to
    // treating everything after the scheme as a plain path.
    return [NSURL fileURLWithPath:[uri substringFromIndex:7]];
  }
  return [NSURL fileURLWithPath:uri];
}

/// Rotation (0/90/180/270) encoded by the track's preferredTransform.
static NSInteger GTRotationDegrees(CGAffineTransform t)
{
  double deg = atan2(t.b, t.a) * 180.0 / M_PI;
  long r = lround(deg);
  r %= 360;
  if (r < 0) {
    r += 360;
  }
  // Snap to the nearest quarter turn.
  r = ((r + 45) / 90) % 4 * 90;
  return (NSInteger)r;
}

/// frameCount = max(1, round(durationMs * fps / 1000)).
static NSInteger GTFrameCount(double durationMs, double fps)
{
  long n = lround(durationMs * fps / 1000.0);
  return (NSInteger)MAX(1L, n);
}

/// Timestamp (ms) of grid index i: t_i = i * 1000 / fps.
static double GTTimestampMs(NSInteger index, double fps)
{
  return (double)index * 1000.0 / fps;
}

static BOOL GTSessionHasMore(GTFrameDecoderSession *session)
{
  if (session.nextIndex >= session.frameCount) {
    return NO;
  }
  return GTTimestampMs(session.nextIndex, session.fps) <=
         session.endMs + kGridToleranceMs;
}

/// Renders `image` stretched to exactly outW x outH in a DeviceGray context
/// and returns the packed row-major luma bytes (top-left origin), or nil.
static NSData *GTGrayscaleLuma(CGImageRef image, NSInteger outW, NSInteger outH)
{
  CGColorSpaceRef gray = CGColorSpaceCreateDeviceGray();
  if (gray == NULL) {
    return nil;
  }
  CGContextRef ctx = CGBitmapContextCreate(
      NULL, (size_t)outW, (size_t)outH, 8, 0 /* CG picks bytesPerRow */, gray,
      kCGImageAlphaNone);
  CGColorSpaceRelease(gray);
  if (ctx == NULL) {
    return nil;
  }
  CGContextSetInterpolationQuality(ctx, kCGInterpolationLow);
  CGContextDrawImage(ctx, CGRectMake(0, 0, outW, outH), image);

  const uint8_t *base = (const uint8_t *)CGBitmapContextGetData(ctx);
  if (base == NULL) {
    CGContextRelease(ctx);
    return nil;
  }
  size_t bytesPerRow = CGBitmapContextGetBytesPerRow(ctx);
  NSMutableData *packed = [NSMutableData dataWithLength:(NSUInteger)(outW * outH)];
  uint8_t *dst = (uint8_t *)packed.mutableBytes;
  for (NSInteger row = 0; row < outH; row++) {
    memcpy(dst + row * outW, base + (size_t)row * bytesPerRow, (size_t)outW);
  }
  CGContextRelease(ctx);
  return packed;
}

/// Decodes the frame at grid index `index` and returns the NativeFrame
/// dictionary, or nil (with *errorOut set) on failure.
static NSDictionary *GTDecodeFrame(AVAssetImageGenerator *generator,
                                   NSInteger index,
                                   double fps,
                                   NSInteger outW,
                                   NSInteger outH,
                                   NSError **errorOut)
{
  double tMs = GTTimestampMs(index, fps);
  CMTime time = CMTimeMakeWithSeconds(tMs / 1000.0, 600);
  NSError *error = nil;
  CGImageRef image = [generator copyCGImageAtTime:time
                                       actualTime:NULL
                                            error:&error];
  if (image == NULL) {
    if (errorOut != NULL) {
      *errorOut = error;
    }
    return nil;
  }
  NSData *luma = GTGrayscaleLuma(image, outW, outH);
  CGImageRelease(image);
  if (luma == nil) {
    if (errorOut != NULL) {
      *errorOut = nil;
    }
    return nil;
  }
  return @{
    @"index" : @(index),
    @"timestampMs" : @(tMs),
    @"width" : @(outW),
    @"height" : @(outH),
    @"lumaBase64" : [luma base64EncodedStringWithOptions:0],
  };
}

#pragma mark - Module

@implementation GolfTracerFrameDecoder {
  NSMutableDictionary<NSString *, GTFrameDecoderSession *> *_sessions;
}

RCT_EXPORT_MODULE(GolfTracerFrameDecoder)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// All exported methods run serialized on this queue, so _sessions needs no
// extra locking, and decoding never touches the main thread.
- (dispatch_queue_t)methodQueue
{
  return dispatch_queue_create("com.golftracerai.framedecoder",
                               DISPATCH_QUEUE_SERIAL);
}

- (instancetype)init
{
  if (self = [super init]) {
    _sessions = [NSMutableDictionary new];
  }
  return self;
}

- (void)invalidate
{
  for (GTFrameDecoderSession *session in _sessions.allValues) {
    [session.generator cancelAllCGImageGeneration];
  }
  [_sessions removeAllObjects];
}

/// Opens `uri`, resolving the video track, upright dimensions, fps and
/// output size. Returns nil after calling reject on failure.
- (GTFrameDecoderSession *)openAsset:(NSString *)uri
                        requestedFps:(double)requestedFps
                         targetWidth:(NSInteger)targetWidth
                            rejecter:(RCTPromiseRejectBlock)reject
                         rotationOut:(NSInteger *)rotationOut
                         durationOut:(double *)durationOut
{
  NSURL *url = GTURLForUri(uri);
  if (url == nil) {
    reject(GTErrOpenFailed, [NSString stringWithFormat:@"Invalid uri: %@", uri], nil);
    return nil;
  }
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
  NSArray<AVAssetTrack *> *tracks = [asset tracksWithMediaType:AVMediaTypeVideo];
  AVAssetTrack *track = tracks.firstObject;
  if (track == nil) {
    reject(GTErrOpenFailed,
           [NSString stringWithFormat:@"No video track in %@", uri], nil);
    return nil;
  }

  double durationMs = CMTimeGetSeconds(asset.duration) * 1000.0;
  if (!(durationMs > 0)) {
    durationMs = 0;
  }

  CGAffineTransform transform = track.preferredTransform;
  CGSize transformed = CGSizeApplyAffineTransform(track.naturalSize, transform);
  double uw = fabs(transformed.width);
  double uh = fabs(transformed.height);
  if (uw < 1 || uh < 1) {
    uw = track.naturalSize.width;
    uh = track.naturalSize.height;
  }

  double fps = requestedFps > 0 ? requestedFps
                                : (track.nominalFrameRate > 0 ? track.nominalFrameRate : 30.0);

  NSInteger outW;
  NSInteger outH;
  if (targetWidth > 0 && (double)targetWidth < uw) {
    outW = targetWidth;
    outH = MAX(1L, lround(uh * (double)targetWidth / uw));
  } else {
    outW = MAX(1L, lround(uw));
    outH = MAX(1L, lround(uh));
  }

  AVAssetImageGenerator *generator =
      [[AVAssetImageGenerator alloc] initWithAsset:asset];
  generator.appliesPreferredTrackTransform = YES;
  generator.maximumSize = CGSizeMake(outW, outH);

  GTFrameDecoderSession *session = [GTFrameDecoderSession new];
  session.asset = asset;
  session.generator = generator;
  session.fps = fps;
  session.outW = outW;
  session.outH = outH;
  session.frameCount = GTFrameCount(durationMs, fps);
  if (rotationOut != NULL) {
    *rotationOut = GTRotationDegrees(transform);
  }
  if (durationOut != NULL) {
    *durationOut = durationMs;
  }
  return session;
}

RCT_EXPORT_METHOD(openSession:(NSString *)uri
                      options:(NSDictionary *)options
                     resolver:(RCTPromiseResolveBlock)resolve
                     rejecter:(RCTPromiseRejectBlock)reject)
{
  double requestedFps = [options[@"fps"] doubleValue];
  NSInteger targetWidth = (NSInteger)[options[@"targetWidth"] doubleValue];

  NSInteger rotationDeg = 0;
  double durationMs = 0;
  GTFrameDecoderSession *session = [self openAsset:uri
                                      requestedFps:requestedFps
                                       targetWidth:targetWidth
                                          rejecter:reject
                                       rotationOut:&rotationDeg
                                       durationOut:&durationMs];
  if (session == nil) {
    return; // already rejected
  }

  double startMs = options[@"startMs"] != nil ? [options[@"startMs"] doubleValue] : 0;
  session.endMs = options[@"endMs"] != nil ? [options[@"endMs"] doubleValue] : HUGE_VAL;
  double strideOpt = options[@"stride"] != nil ? [options[@"stride"] doubleValue] : 1;
  session.stride = (NSInteger)MAX(1.0, floor(strideOpt));
  long firstIndex = (long)ceil(startMs * session.fps / 1000.0 - kGridToleranceMs);
  session.nextIndex = (NSInteger)MAX(0L, firstIndex);

  // Sampling accuracy: half a grid step keeps us on the intended source
  // frame without forcing exact (slow) seeks.
  CMTime tolerance = CMTimeMakeWithSeconds(0.5 / session.fps, 600);
  session.generator.requestedTimeToleranceBefore = tolerance;
  session.generator.requestedTimeToleranceAfter = tolerance;

  NSString *sessionId = [NSUUID UUID].UUIDString;
  _sessions[sessionId] = session;

  resolve(@{
    @"sessionId" : sessionId,
    @"width" : @(session.outW),
    @"height" : @(session.outH),
    @"durationMs" : @(durationMs),
    @"nominalFps" : @(session.fps),
    @"rotationDeg" : @(rotationDeg),
  });
}

RCT_EXPORT_METHOD(nextFrames:(NSString *)sessionId
                    maxCount:(double)maxCount
                    resolver:(RCTPromiseResolveBlock)resolve
                    rejecter:(RCTPromiseRejectBlock)reject)
{
  GTFrameDecoderSession *session = _sessions[sessionId];
  if (session == nil) {
    reject(GTErrBadSession,
           [NSString stringWithFormat:@"Unknown or closed session: %@", sessionId],
           nil);
    return;
  }

  NSInteger limit = (NSInteger)MAX(0.0, floor(maxCount));
  NSMutableArray<NSDictionary *> *frames = [NSMutableArray arrayWithCapacity:(NSUInteger)limit];
  while ((NSInteger)frames.count < limit && GTSessionHasMore(session)) {
    @autoreleasepool {
      NSError *error = nil;
      NSDictionary *frame = GTDecodeFrame(session.generator, session.nextIndex,
                                          session.fps, session.outW,
                                          session.outH, &error);
      if (frame == nil) {
        reject(GTErrDecodeFailed,
               [NSString stringWithFormat:@"Failed to decode frame %ld: %@",
                                          (long)session.nextIndex,
                                          error.localizedDescription ?: @"conversion failure"],
               error);
        return;
      }
      [frames addObject:frame];
      session.nextIndex += session.stride;
    }
  }

  resolve(@{
    @"frames" : frames,
    @"done" : @(!GTSessionHasMore(session)),
  });
}

RCT_EXPORT_METHOD(closeSession:(NSString *)sessionId
                      resolver:(RCTPromiseResolveBlock)resolve
                      rejecter:(RCTPromiseRejectBlock)reject)
{
  GTFrameDecoderSession *session = _sessions[sessionId];
  if (session != nil) {
    [session.generator cancelAllCGImageGeneration];
    [_sessions removeObjectForKey:sessionId];
  }
  // Idempotent: unknown ids still resolve.
  resolve(nil);
}

RCT_EXPORT_METHOD(frameAt:(NSString *)uri
              timestampMs:(double)timestampMs
              targetWidth:(double)targetWidth
                      fps:(double)fps
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  double durationMs = 0;
  GTFrameDecoderSession *session = [self openAsset:uri
                                      requestedFps:fps // 0 = unset sentinel
                                       targetWidth:(NSInteger)targetWidth
                                          rejecter:reject
                                       rotationOut:NULL
                                       durationOut:&durationMs];
  if (session == nil) {
    return; // already rejected
  }
  session.generator.requestedTimeToleranceBefore = kCMTimeZero;
  session.generator.requestedTimeToleranceAfter = kCMTimeZero;

  double clampedT = MIN(MAX(0.0, timestampMs), durationMs);
  long index = MAX(0L, lround(clampedT * session.fps / 1000.0));
  index = MIN(index, (long)session.frameCount - 1);

  @autoreleasepool {
    NSError *error = nil;
    NSDictionary *frame = GTDecodeFrame(session.generator, (NSInteger)index,
                                        session.fps, session.outW,
                                        session.outH, &error);
    if (frame == nil) {
      reject(GTErrDecodeFailed,
             [NSString stringWithFormat:@"Failed to decode frame at %f ms: %@",
                                        timestampMs,
                                        error.localizedDescription ?: @"conversion failure"],
             error);
      return;
    }
    resolve(frame);
  }
}

@end
