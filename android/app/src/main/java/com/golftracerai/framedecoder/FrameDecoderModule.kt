package com.golftracerai.framedecoder

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Classic-bridge NativeModule that decodes video frames as downscaled,
 * upright grayscale (luma) buffers.
 *
 * Contract (shared verbatim with the iOS implementation):
 * - Sampling grid mirrors SyntheticFrameSource:
 *     frameCount = max(1, round(durationMs * fps / 1000)); t_i = i * 1000 / fps.
 * - Frames are always emitted upright (rotation metadata applied).
 * - Luma is row-major outW*outH bytes, BT.601-ish (77R + 150G + 29B) >> 8,
 *   base64 encoded without line wraps.
 * - Timestamps are raw media-timeline presentation ms; slow-motion fps
 *   remapping is owned by the JS layer.
 * - Error codes: E_OPEN_FAILED, E_BAD_SESSION, E_DECODE_FAILED.
 *
 * Threading: every bridge method hops onto a single-thread executor; the
 * MediaMetadataRetriever instances and the session map are confined to that
 * thread, so no synchronization is needed and decoding never blocks the JS
 * or UI threads.
 */
class FrameDecoderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private class Session(
      val retriever: MediaMetadataRetriever,
      val fps: Double,
      val stride: Int,
      var nextIndex: Int,
      val frameCount: Int,
      val endMs: Double,
      val outW: Int,
      val outH: Int,
  ) {
    var closed: Boolean = false
    val pixelBuffer: IntArray = IntArray(outW * outH)
  }

  private class OpenInfo(
      val retriever: MediaMetadataRetriever,
      val durationMs: Double,
      val fps: Double,
      val rotationDeg: Int,
      val frameCount: Int,
      val outW: Int,
      val outH: Int,
  )

  private val executor = Executors.newSingleThreadExecutor()
  private val sessions = HashMap<String, Session>()

  override fun getName(): String = "GolfTracerFrameDecoder"

  @ReactMethod
  fun openSession(uri: String, options: ReadableMap, promise: Promise) {
    executor.execute {
      var retriever: MediaMetadataRetriever? = null
      try {
        val requestedFps =
            if (options.hasKey("fps") && !options.isNull("fps")) options.getDouble("fps") else 0.0
        val info = open(uri, requestedFps, targetWidthOf(options))
        retriever = info.retriever

        val startMs =
            if (options.hasKey("startMs") && !options.isNull("startMs")) {
              options.getDouble("startMs")
            } else {
              0.0
            }
        val endMs =
            if (options.hasKey("endMs") && !options.isNull("endMs")) {
              options.getDouble("endMs")
            } else {
              Double.POSITIVE_INFINITY
            }
        val stride =
            if (options.hasKey("stride") && !options.isNull("stride")) {
              max(1, floor(options.getDouble("stride")).toInt())
            } else {
              1
            }
        val firstIndex = max(0.0, ceil(startMs * info.fps / 1000.0 - 1e-6)).toInt()

        val sessionId = UUID.randomUUID().toString()
        sessions[sessionId] =
            Session(
                retriever = info.retriever,
                fps = info.fps,
                stride = stride,
                nextIndex = firstIndex,
                frameCount = info.frameCount,
                endMs = endMs,
                outW = info.outW,
                outH = info.outH,
            )

        val result = Arguments.createMap()
        result.putString("sessionId", sessionId)
        result.putInt("width", info.outW)
        result.putInt("height", info.outH)
        result.putDouble("durationMs", info.durationMs)
        result.putDouble("nominalFps", info.fps)
        result.putInt("rotationDeg", info.rotationDeg)
        promise.resolve(result)
      } catch (e: Exception) {
        try {
          retriever?.release()
        } catch (ignored: Exception) {}
        promise.reject("E_OPEN_FAILED", "Failed to open video '$uri': ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun nextFrames(sessionId: String, maxCount: Double, promise: Promise) {
    executor.execute {
      val session = sessions[sessionId]
      if (session == null || session.closed) {
        promise.reject("E_BAD_SESSION", "Unknown or closed session '$sessionId'")
        return@execute
      }
      try {
        val frames = Arguments.createArray()
        val limit = max(0, maxCount.toInt())
        var produced = 0
        while (produced < limit && hasMore(session)) {
          val i = session.nextIndex
          val timestampMs = i * 1000.0 / session.fps
          val bitmap = decodeScaledFrame(session.retriever, timestampMs, session.outW, session.outH)
          if (bitmap == null) {
            promise.reject(
                "E_DECODE_FAILED", "Decoder returned no frame at index $i (${timestampMs}ms)")
            return@execute
          }
          val lumaBase64 = bitmapToLumaBase64(bitmap, session.pixelBuffer)
          bitmap.recycle()

          val frame = Arguments.createMap()
          frame.putInt("index", i)
          frame.putDouble("timestampMs", timestampMs)
          frame.putInt("width", session.outW)
          frame.putInt("height", session.outH)
          frame.putString("lumaBase64", lumaBase64)
          frames.pushMap(frame)

          session.nextIndex += session.stride
          produced += 1
        }
        val result = Arguments.createMap()
        result.putArray("frames", frames)
        result.putBoolean("done", !hasMore(session))
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("E_DECODE_FAILED", "Frame decode failed: ${e.message}", e)
      }
    }
  }

  @ReactMethod
  fun closeSession(sessionId: String, promise: Promise) {
    executor.execute {
      val session = sessions.remove(sessionId)
      if (session != null) {
        session.closed = true
        try {
          session.retriever.release()
        } catch (ignored: Exception) {}
      }
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun frameAt(uri: String, timestampMs: Double, targetWidth: Double, fps: Double, promise: Promise) {
    executor.execute {
      var retriever: MediaMetadataRetriever? = null
      var opened = false
      try {
        val info =
            try {
              open(uri, fps, targetWidth.toInt())
            } catch (e: Exception) {
              promise.reject("E_OPEN_FAILED", "Failed to open video '$uri': ${e.message}", e)
              return@execute
            }
        retriever = info.retriever
        opened = true

        val clampedT = min(max(0.0, timestampMs), info.durationMs)
        val index =
            min(max(0, (clampedT * info.fps / 1000.0).roundToInt()), info.frameCount - 1)
        val gridTimestampMs = index * 1000.0 / info.fps

        val bitmap = decodeScaledFrame(info.retriever, gridTimestampMs, info.outW, info.outH)
        if (bitmap == null) {
          promise.reject(
              "E_DECODE_FAILED", "Decoder returned no frame at index $index (${gridTimestampMs}ms)")
          return@execute
        }
        val lumaBase64 = bitmapToLumaBase64(bitmap, IntArray(info.outW * info.outH))
        bitmap.recycle()

        val frame = Arguments.createMap()
        frame.putInt("index", index)
        frame.putDouble("timestampMs", gridTimestampMs)
        frame.putInt("width", info.outW)
        frame.putInt("height", info.outH)
        frame.putString("lumaBase64", lumaBase64)
        promise.resolve(frame)
      } catch (e: Exception) {
        val code = if (opened) "E_DECODE_FAILED" else "E_OPEN_FAILED"
        promise.reject(code, "frameAt failed for '$uri': ${e.message}", e)
      } finally {
        try {
          retriever?.release()
        } catch (ignored: Exception) {}
      }
    }
  }

  override fun invalidate() {
    executor.execute {
      for (session in sessions.values) {
        session.closed = true
        try {
          session.retriever.release()
        } catch (ignored: Exception) {}
      }
      sessions.clear()
    }
    executor.shutdown()
    super.invalidate()
  }

  private fun hasMore(session: Session): Boolean {
    val i = session.nextIndex
    if (i >= session.frameCount) return false
    val t = i * 1000.0 / session.fps
    return t <= session.endMs + 1e-6
  }

  private fun targetWidthOf(options: ReadableMap): Int =
      if (options.hasKey("targetWidth") && !options.isNull("targetWidth")) {
        options.getDouble("targetWidth").toInt()
      } else {
        0
      }

  /**
   * Opens [uri] with a fresh MediaMetadataRetriever and resolves the shared
   * open-time values: duration, sampling fps, rotation, grid frame count and
   * output dimensions. Throws on any failure (caller maps to E_OPEN_FAILED).
   */
  private fun open(uri: String, requestedFps: Double, targetWidth: Int): OpenInfo {
    val retriever = MediaMetadataRetriever()
    try {
      when {
        uri.startsWith("content://") ->
            retriever.setDataSource(reactApplicationContext, Uri.parse(uri))
        uri.startsWith("file://") ->
            retriever.setDataSource(
                Uri.parse(uri).path ?: throw IllegalArgumentException("Invalid file uri: $uri"))
        else -> retriever.setDataSource(uri)
      }

      val durationMs =
          retriever
              .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
              ?.toDoubleOrNull()
              ?.takeIf { it > 0 } ?: throw IllegalStateException("No duration metadata")
      val srcW =
          retriever
              .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
              ?.toIntOrNull()
              ?.takeIf { it > 0 } ?: throw IllegalStateException("No video track (width missing)")
      val srcH =
          retriever
              .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
              ?.toIntOrNull()
              ?.takeIf { it > 0 } ?: throw IllegalStateException("No video track (height missing)")
      val rotationDeg =
          retriever
              .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
              ?.toIntOrNull() ?: 0

      val fps: Double =
          if (requestedFps > 0) {
            requestedFps
          } else {
            val containerFps =
                if (Build.VERSION.SDK_INT >= 28) {
                  retriever
                      .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)
                      ?.toDoubleOrNull()
                      ?.takeIf { it > 0 }
                      ?.let { it * 1000.0 / durationMs }
                } else {
                  null
                }
            containerFps ?: 30.0
          }

      // Upright (rotation-applied) source dimensions.
      val uprightW = if (rotationDeg == 90 || rotationDeg == 270) srcH else srcW
      val uprightH = if (rotationDeg == 90 || rotationDeg == 270) srcW else srcH

      val outW: Int
      val outH: Int
      if (targetWidth in 1 until uprightW) {
        outW = targetWidth
        outH = max(1, (uprightH.toDouble() * targetWidth / uprightW).roundToInt())
      } else {
        outW = uprightW
        outH = uprightH
      }

      val frameCount = max(1.0, Math.round(durationMs * fps / 1000.0).toDouble()).toInt()

      return OpenInfo(retriever, durationMs, fps, rotationDeg, frameCount, outW, outH)
    } catch (e: Exception) {
      try {
        retriever.release()
      } catch (ignored: Exception) {}
      throw e
    }
  }

  /**
   * Decodes the frame nearest [timestampMs] and returns a bitmap of exactly
   * [outW] x [outH], or null when the decoder yields nothing.
   * MediaMetadataRetriever applies the rotation metadata itself, so the
   * returned bitmap is already upright.
   */
  private fun decodeScaledFrame(
      retriever: MediaMetadataRetriever,
      timestampMs: Double,
      outW: Int,
      outH: Int,
  ): Bitmap? {
    val tUs = Math.round(timestampMs * 1000.0)
    val decoded: Bitmap? =
        if (Build.VERSION.SDK_INT >= 27) {
          retriever.getScaledFrameAtTime(
              tUs, MediaMetadataRetriever.OPTION_CLOSEST, outW, outH)
        } else {
          retriever.getFrameAtTime(tUs, MediaMetadataRetriever.OPTION_CLOSEST)
        }
    if (decoded == null) return null
    if (decoded.width == outW && decoded.height == outH) return decoded
    // getScaledFrameAtTime preserves aspect ratio (fits within outW x outH),
    // so force the exact contract dimensions.
    val scaled = Bitmap.createScaledBitmap(decoded, outW, outH, true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
  }

  /** Converts a bitmap to a row-major BT.601 luma byte array, base64 (no wraps). */
  private fun bitmapToLumaBase64(bitmap: Bitmap, pixelBuffer: IntArray): String {
    val w = bitmap.width
    val h = bitmap.height
    bitmap.getPixels(pixelBuffer, 0, w, 0, 0, w, h)
    val luma = ByteArray(w * h)
    for (p in 0 until w * h) {
      val c = pixelBuffer[p]
      val r = (c shr 16) and 0xFF
      val g = (c shr 8) and 0xFF
      val b = c and 0xFF
      luma[p] = ((77 * r + 150 * g + 29 * b) shr 8).toByte()
    }
    return Base64.encodeToString(luma, Base64.NO_WRAP)
  }
}
